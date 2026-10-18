package tw.cycle.server.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;

/** 註冊、登入、登出、用 token 找出是誰。 */
@Service
public class AuthService {
    /** 同一個帳號連續登入失敗幾次就暫停一陣子（擋暴力猜密碼）。 */
    static final int MAX_FAILURES = 8;
    static final Duration LOCKOUT = Duration.ofMinutes(10);

    private final AccountRepository accounts;
    private final SessionRepository sessions;
    private final PasswordEncoder encoder;
    private final CycleProperties props;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Failures> failures = new ConcurrentHashMap<>();

    private record Failures(int count, Instant last) {}

    public record Login(String token, String username) {}

    public AuthService(AccountRepository accounts, SessionRepository sessions, PasswordEncoder encoder, CycleProperties props, Clock clock) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.encoder = encoder;
        this.props = props;
        this.clock = clock;
    }

    @Transactional
    public Login register(String username, String password) {
        if (accounts.existsByUsernameIgnoreCase(username)) throw new ApiException(HttpStatus.CONFLICT, "taken", "這個名字已經有人用了");
        Account account = accounts.save(new Account(username, encoder.encode(password), now()));
        return new Login(issue(account), account.getUsername());
    }

    @Transactional
    public Login login(String username, String password) {
        String key = username.toLowerCase();
        Failures f = failures.get(key);
        if (f != null && f.count() >= MAX_FAILURES && Duration.between(f.last(), clock.instant()).compareTo(LOCKOUT) < 0)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "locked", "密碼錯太多次了，請 10 分鐘後再試");
        Optional<Account> account = accounts.findByUsernameIgnoreCase(username);
        if (account.isEmpty() || !encoder.matches(password, account.get().getPasswordHash())) {
            failures.merge(key, new Failures(1, clock.instant()), (a, b) -> new Failures(a.count() + 1, b.last()));
            throw new ApiException(HttpStatus.UNAUTHORIZED, "bad_login", "帳號或密碼不對");
        }
        failures.remove(key);
        return new Login(issue(account.get()), account.get().getUsername());
    }

    @Transactional
    public void logout(String token) {
        sessions.deleteById(hash(token));
    }

    /** token 有效就回傳帳號 id。 */
    @Transactional(readOnly = true)
    public Optional<Long> authenticate(String token) {
        return sessions.findById(hash(token)).filter(s -> s.getExpiresAt().isAfter(now())).map(Session::getAccountId);
    }

    public Optional<Account> account(Long id) {
        return accounts.findById(id);
    }

    private String issue(Account account) {
        sessions.deleteExpired(now());
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.save(new Session(hash(token), account.getId(), now(), now().plusDays(props.sessionDays())));
        return token;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
