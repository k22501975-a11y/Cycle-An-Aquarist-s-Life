package tw.cycle.server.save;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface CloudSaveRepository extends JpaRepository<CloudSave, Long> {
    /**
     * 讀存檔並鎖住到交易結束（docs/ledger.md §3.6）：會寫雲端存檔的地方（上傳、補算、市場扣款入帳）都用這把鎖，
     * 不然補算跑模擬的時候市場扣了款，補算再把舊的錢寫回去，扣款就不見了。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CloudSave s where s.accountId = :id")
    Optional<CloudSave> findForUpdate(Long id);
}
