package tw.cycle.server.push;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push 的加密（RFC 8291，aes128gcm）和 VAPID 簽章（RFC 8292），只用 JDK 內建的密碼學。
 * 推播服務（Google、Mozilla、Apple）看不到通知內容，只有收件的瀏覽器解得開。
 */
public final class WebPushCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();
    /** 一筆紀錄的大小；通知很短，一筆就裝得下。 */
    private static final int RECORD_SIZE = 4096;

    private WebPushCrypto() {}

    public static String b64(byte[] bytes) {
        return B64.encodeToString(bytes);
    }

    public static byte[] unb64(String s) {
        return B64D.decode(s.replace('+', '-').replace('/', '_').replace("=", ""));
    }

    static ECParameterSpec p256() throws GeneralSecurityException {
        AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
        params.init(new ECGenParameterSpec("secp256r1"));
        return params.getParameterSpec(ECParameterSpec.class);
    }

    public static KeyPair generateKeyPair() throws GeneralSecurityException {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
        kpg.initialize(new ECGenParameterSpec("secp256r1"));
        return kpg.generateKeyPair();
    }

    /** 公鑰的未壓縮格式（0x04 || X || Y，65 bytes）。 */
    public static byte[] rawPublic(ECPublicKey key) {
        byte[] out = new byte[65];
        out[0] = 4;
        System.arraycopy(fixed(key.getW().getAffineX()), 0, out, 1, 32);
        System.arraycopy(fixed(key.getW().getAffineY()), 0, out, 33, 32);
        return out;
    }

    public static byte[] rawPrivate(ECPrivateKey key) {
        return fixed(key.getS());
    }

    public static ECPublicKey publicKey(byte[] raw) throws GeneralSecurityException {
        if (raw.length != 65 || raw[0] != 4) throw new GeneralSecurityException("bad public key");
        ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(raw, 1, 33)), new BigInteger(1, Arrays.copyOfRange(raw, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, p256()));
    }

    public static ECPrivateKey privateKey(byte[] raw) throws GeneralSecurityException {
        return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, raw), p256()));
    }

    private static byte[] fixed(BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length == 32) return b;
        byte[] out = new byte[32];
        if (b.length > 32) System.arraycopy(b, b.length - 32, out, 0, 32);
        else System.arraycopy(b, 0, out, 32 - b.length, b.length);
        return out;
    }

    static byte[] hmac(byte[] key, byte[]... parts) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        for (byte[] p : parts) mac.update(p);
        return mac.doFinal();
    }

    static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        ByteBuffer buf = ByteBuffer.allocate(n);
        for (byte[] p : parts) buf.put(p);
        return buf.array();
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    /**
     * 加密一則通知給某台裝置（RFC 8291 §3.4）。
     * uaPublic、authSecret 是瀏覽器訂閱時給的 p256dh、auth；回傳的就是要 POST 給推播服務的內容。
     */
    public static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret) throws GeneralSecurityException {
        return encrypt(plaintext, uaPublic, authSecret, generateKeyPair(), randomBytes(16));
    }

    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, KeyPair ephemeral, byte[] salt) throws GeneralSecurityException {
        byte[] asPublic = rawPublic((ECPublicKey) ephemeral.getPublic());
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(ephemeral.getPrivate());
        ka.doPhase(publicKey(uaPublic), true);
        byte[] ecdh = ka.generateSecret();
        byte[] cek = deriveContentKey(ecdh, authSecret, uaPublic, asPublic, salt);
        byte[] nonce = deriveNonce(ecdh, authSecret, uaPublic, asPublic, salt);
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        // 最後一筆紀錄：內容後面接 0x02
        byte[] ciphertext = gcm.doFinal(concat(plaintext, new byte[] {2}));
        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
        return concat(header.array(), ciphertext);
    }

    private static byte[] ikm(byte[] ecdh, byte[] authSecret, byte[] uaPublic, byte[] asPublic) throws GeneralSecurityException {
        byte[] prkKey = hmac(authSecret, ecdh);
        return hmac(prkKey, ascii("WebPush: info\0"), uaPublic, asPublic, new byte[] {1});
    }

    public static byte[] deriveContentKey(byte[] ecdh, byte[] authSecret, byte[] uaPublic, byte[] asPublic, byte[] salt) throws GeneralSecurityException {
        byte[] prk = hmac(salt, ikm(ecdh, authSecret, uaPublic, asPublic));
        return Arrays.copyOf(hmac(prk, ascii("Content-Encoding: aes128gcm\0"), new byte[] {1}), 16);
    }

    public static byte[] deriveNonce(byte[] ecdh, byte[] authSecret, byte[] uaPublic, byte[] asPublic, byte[] salt) throws GeneralSecurityException {
        byte[] prk = hmac(salt, ikm(ecdh, authSecret, uaPublic, asPublic));
        return Arrays.copyOf(hmac(prk, ascii("Content-Encoding: nonce\0"), new byte[] {1}), 12);
    }

    /** VAPID 的 JWT（ES256），audience 是推播服務的來源，例如 https://fcm.googleapis.com。 */
    public static String vapidJwt(String audience, String subject, long expiresAtSeconds, ECPrivateKey key) throws GeneralSecurityException {
        String header = b64(ascii("{\"typ\":\"JWT\",\"alg\":\"ES256\"}"));
        String claims = b64(("{\"aud\":\"" + audience + "\",\"exp\":" + expiresAtSeconds + ",\"sub\":\"" + subject + "\"}").getBytes(StandardCharsets.UTF_8));
        Signature sig = Signature.getInstance("SHA256withECDSAinP1363Format");
        sig.initSign(key);
        sig.update(ascii(header + "." + claims));
        return header + "." + claims + "." + b64(sig.sign());
    }

    public static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }
}
