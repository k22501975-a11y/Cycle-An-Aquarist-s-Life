package tw.cycle.server.save;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;

@Entity
@Table(name = "cloud_save")
public class CloudSave {
    @Id
    @Column(name = "account_id")
    private Long accountId;

    @Column(nullable = false)
    private long revision;

    /** 遊戲存檔時的現實時間（毫秒），和本機存檔的 savedAt 比較用。 */
    @Column(name = "saved_at", nullable = false)
    private long savedAt;

    @Column(name = "save_version", nullable = false)
    private int saveVersion;

    /** 整份存檔 JSON（伺服器不解析，只負責保管）。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String data;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /** 強制用一份對不上的存檔覆蓋之後，到這個時間以前不能在市場上架魚（L2）。 */
    @Column(name = "market_locked_until")
    private OffsetDateTime marketLockedUntil;

    /** 沒有跟上一份比對過（第一次上傳、強制覆蓋）：市場不能上架魚（#76）。 */
    @Column(nullable = false)
    private boolean unverified;

    /** 強制覆蓋前最後一份驗證過的存檔：之後上傳的存檔要跟這份比對通過才解除未驗證。 */
    @Column(name = "verified_data", columnDefinition = "TEXT")
    private String verifiedData;

    @Column(name = "verified_at")
    private OffsetDateTime verifiedAt;

    protected CloudSave() {}

    public CloudSave(Long accountId) {
        this.accountId = accountId;
    }

    public void update(long savedAt, int saveVersion, String data, OffsetDateTime now) {
        this.revision++;
        this.savedAt = savedAt;
        this.saveVersion = saveVersion;
        this.data = data;
        this.updatedAt = now;
    }

    public long getRevision() {
        return revision;
    }

    public long getSavedAt() {
        return savedAt;
    }

    public int getSaveVersion() {
        return saveVersion;
    }

    public String getData() {
        return data;
    }

    /** 伺服器收到這份存檔的時間（伺服器時鐘，不是遊戲端的 savedAt）。 */
    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public OffsetDateTime getMarketLockedUntil() {
        return marketLockedUntil;
    }

    public boolean isUnverified() {
        return unverified;
    }

    public String getVerifiedData() {
        return verifiedData;
    }

    public OffsetDateTime getVerifiedAt() {
        return verifiedAt;
    }

    /** 標成未驗證；原本驗證過的這份留下來，之後拿來比對。 */
    public void markUnverified() {
        if (!unverified && data != null) {
            verifiedData = data;
            verifiedAt = updatedAt;
        }
        unverified = true;
    }

    public void markVerified() {
        unverified = false;
        verifiedData = null;
        verifiedAt = null;
    }

    public void lockMarketUntil(OffsetDateTime until) {
        this.marketLockedUntil = until;
    }
}
