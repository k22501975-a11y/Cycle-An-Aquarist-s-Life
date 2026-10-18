package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tw.cycle.server.push.PushService;
import tw.cycle.server.push.PushTransport;
import tw.cycle.server.push.WebPushCrypto;

@SpringBootTest
@AutoConfigureMockMvc
class PushTest {
    /** 假的推播服務：記下收到的請求，回傳設定好的狀態碼。 */
    static class FakeTransport implements PushTransport {
        record Sent(URI endpoint, Map<String, String> headers, byte[] body) {}

        final List<Sent> sent = new ArrayList<>();
        int status = 201;

        @Override
        public int post(URI endpoint, Map<String, String> headers, byte[] body) {
            sent.add(new Sent(endpoint, headers, body));
            return status;
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }

        @Bean
        @Primary
        FakeTransport fakeTransport() {
            return new FakeTransport();
        }
    }

    private static final AtomicInteger SEQ = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @Autowired FakeTransport transport;
    @Autowired PushService push;

    /** 一台假的瀏覽器：自己的金鑰對和 auth。 */
    record Browser(String id, String secret, KeyPair keys, byte[] auth, String endpoint) {
        String p256dh() {
            return WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) keys.getPublic()));
        }
    }

    @BeforeEach
    void reset() {
        push.sendDue();
        transport.sent.clear();
        transport.status = 201;
    }

    private ResultActions send(MockHttpServletRequestBuilder req, String token, String body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private Browser browser() throws Exception {
        String id = UUID.randomUUID().toString();
        return new Browser(id, "secret-" + id, WebPushCrypto.generateKeyPair(), WebPushCrypto.randomBytes(16), "https://fcm.googleapis.com/fcm/send/" + id);
    }

    private ResultActions register(Browser b, String token, String... categories) throws Exception {
        String body = json.writeValueAsString(Map.of("secret", b.secret(), "endpoint", b.endpoint(), "p256dh", b.p256dh(), "auth", WebPushCrypto.b64(b.auth()), "categories", List.of(categories)));
        return send(put("/api/push/devices/" + b.id()), token, body);
    }

    private ResultActions schedule(Browser b, long at, String category, String text) throws Exception {
        String body = json.writeValueAsString(Map.of("secret", b.secret(), "items", List.of(Map.of("at", at, "category", category, "title", "水族人生", "body", text, "tag", "t"))));
        return send(put("/api/push/devices/" + b.id() + "/schedule"), null, body);
    }

    /** 用瀏覽器的私鑰解開通知（RFC 8291 的反向）。 */
    private JsonNode decrypt(Browser b, byte[] body) throws Exception {
        byte[] salt = Arrays.copyOfRange(body, 0, 16);
        int idlen = body[20];
        byte[] asPublic = Arrays.copyOfRange(body, 21, 21 + idlen);
        byte[] ciphertext = Arrays.copyOfRange(body, 21 + idlen, body.length);
        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(b.keys().getPrivate());
        ka.doPhase(WebPushCrypto.publicKey(asPublic), true);
        byte[] ecdh = ka.generateSecret();
        byte[] ua = WebPushCrypto.rawPublic((ECPublicKey) b.keys().getPublic());
        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(WebPushCrypto.deriveContentKey(ecdh, b.auth(), ua, asPublic, salt), "AES"),
                new GCMParameterSpec(128, WebPushCrypto.deriveNonce(ecdh, b.auth(), ua, asPublic, salt)));
        byte[] plain = gcm.doFinal(ciphertext);
        assertThat(plain[plain.length - 1]).isEqualTo((byte) 2);
        return json.readTree(new String(plain, 0, plain.length - 1, StandardCharsets.UTF_8));
    }

    @Test
    void 預測的通知到時間才送_內容加密_VAPID簽章正確() throws Exception {
        String key = read(send(get("/api/push/key"), null, null).andExpect(status().isOk())).get("publicKey").asText();
        assertThat(WebPushCrypto.unb64(key)).hasSize(65);
        assertThat(read(send(get("/api/push/key"), null, null)).get("publicKey").asText()).isEqualTo(key);

        Browser b = browser();
        register(b, null, "crisis", "breeding").andExpect(status().isNoContent());
        long at = clock.millis() + Duration.ofHours(2).toMillis();
        send(put("/api/push/devices/" + b.id() + "/schedule"), null, json.writeValueAsString(Map.of("secret", b.secret(), "items", List.of(
                Map.of("at", at, "category", "crisis", "title", "水族人生", "body", "氨快速升高", "tag", "ammonia"),
                Map.of("at", at, "category", "market", "title", "水族人生", "body", "沒開這類", "tag", "x")))))
                .andExpect(jsonPath("$.scheduled").value(1));

        push.sendDue();
        assertThat(transport.sent).isEmpty();
        clock.advance(Duration.ofHours(2));
        push.sendDue();
        assertThat(transport.sent).hasSize(1);
        FakeTransport.Sent s = transport.sent.get(0);
        assertThat(s.endpoint().toString()).isEqualTo(b.endpoint());
        assertThat(s.headers()).containsEntry("Content-Encoding", "aes128gcm").containsEntry("Urgency", "high");
        JsonNode msg = decrypt(b, s.body());
        assertThat(msg.get("body").asText()).isEqualTo("氨快速升高");
        assertThat(msg.get("category").asText()).isEqualTo("crisis");

        // Authorization: vapid t=<jwt>, k=<公鑰>
        String auth = s.headers().get("Authorization");
        assertThat(auth).startsWith("vapid t=").endsWith(", k=" + key);
        String jwt = auth.substring(8, auth.indexOf(','));
        String[] parts = jwt.split("\\.");
        assertThat(new String(WebPushCrypto.unb64(parts[1]), StandardCharsets.UTF_8)).contains("\"aud\":\"https://fcm.googleapis.com\"");
        Signature sig = Signature.getInstance("SHA256withECDSAinP1363Format");
        sig.initVerify(WebPushCrypto.publicKey(WebPushCrypto.unb64(key)));
        sig.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(sig.verify(WebPushCrypto.unb64(parts[2]))).isTrue();

        // 送過不會再送
        push.sendDue();
        assertThat(transport.sent).hasSize(1);
    }

    @Test
    void 重新排程會換掉舊的_打開遊戲時清空() throws Exception {
        Browser b = browser();
        register(b, null, "crisis").andExpect(status().isNoContent());
        long at = clock.millis() + Duration.ofHours(1).toMillis();
        schedule(b, at, "crisis", "舊的").andExpect(status().isOk());
        schedule(b, at, "crisis", "新的").andExpect(status().isOk());
        clock.advance(Duration.ofHours(1));
        push.sendDue();
        assertThat(transport.sent).hasSize(1);
        assertThat(decrypt(b, transport.sent.get(0).body()).get("body").asText()).isEqualTo("新的");

        schedule(b, clock.millis() + 60_000, "crisis", "會被取消").andExpect(status().isOk());
        send(put("/api/push/devices/" + b.id() + "/schedule"), null, "{\"secret\":\"" + b.secret() + "\",\"items\":[]}").andExpect(status().isOk());
        clock.advance(Duration.ofMinutes(2));
        push.sendDue();
        assertThat(transport.sent).hasSize(1);
    }

    @Test
    void 不認得的推播網址和錯的密碼都擋下() throws Exception {
        Browser b = browser();
        Browser evil = new Browser(b.id(), b.secret(), b.keys(), b.auth(), "https://169.254.169.254/latest");
        register(evil, null, "crisis").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("bad_endpoint"));
        register(new Browser(b.id(), b.secret(), b.keys(), b.auth(), "http://fcm.googleapis.com/x"), null, "crisis").andExpect(status().isBadRequest());
        register(b, null, "crisis").andExpect(status().isNoContent());
        Browser thief = new Browser(b.id(), "another-secret-123", b.keys(), b.auth(), b.endpoint());
        register(thief, null, "crisis").andExpect(status().isForbidden());
        schedule(thief, clock.millis(), "crisis", "x").andExpect(status().isForbidden());
        send(delete("/api/push/devices/" + b.id()), null, "{\"secret\":\"" + b.secret() + "\"}").andExpect(status().isNoContent());
        schedule(b, clock.millis(), "crisis", "x").andExpect(status().isNotFound());
    }

    @Test
    void 有人買了你的魚_登入的裝置收到市場通知_沒開市場類別的不收() throws Exception {
        String seller = read(send(post("/api/auth/register"), null, "{\"username\":\"pushamy" + SEQ.incrementAndGet() + "\",\"password\":\"guppy-1234\"}")).get("token").asText();
        String buyer = read(send(post("/api/auth/register"), null, "{\"username\":\"pushben" + SEQ.incrementAndGet() + "\",\"password\":\"guppy-1234\"}")).get("token").asText();
        Browser phone = browser();
        Browser tablet = browser();
        register(phone, seller, "crisis", "market").andExpect(status().isNoContent());
        register(tablet, seller, "crisis").andExpect(status().isNoContent());
        clock.advance(Duration.ofDays(3));
        long listing = read(send(post("/api/market/listings"), seller, "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"藍草孔雀魚 公\",\"price\":200,\"item\":{\"health\":1}}")).get("id").asLong();
        send(post("/api/market/listings/" + listing + "/buy"), buyer, "{\"packaging\":\"bag\"}").andExpect(status().isOk());
        push.sendDue();
        assertThat(transport.sent).hasSize(1);
        assertThat(transport.sent.get(0).endpoint().toString()).isEqualTo(phone.endpoint());
        assertThat(decrypt(phone, transport.sent.get(0).body()).get("body").asText()).contains("藍草孔雀魚 公");
    }

    @Test
    void 訂閱失效就刪掉裝置() throws Exception {
        Browser b = browser();
        register(b, null, "crisis").andExpect(status().isNoContent());
        schedule(b, clock.millis(), "crisis", "x").andExpect(status().isOk());
        transport.status = 410;
        push.sendDue();
        schedule(b, clock.millis(), "crisis", "x").andExpect(status().isNotFound());
    }
}
