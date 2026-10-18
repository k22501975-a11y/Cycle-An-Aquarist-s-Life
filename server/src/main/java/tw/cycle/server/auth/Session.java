package tw.cycle.server.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.OffsetDateTime;

@Entity
public class Session {
    @Id
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    protected Session() {}

    public Session(String tokenHash, Long accountId, OffsetDateTime createdAt, OffsetDateTime expiresAt) {
        this.tokenHash = tokenHash;
        this.accountId = accountId;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public Long getAccountId() {
        return accountId;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }
}
