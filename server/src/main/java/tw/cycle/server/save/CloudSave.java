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
}
