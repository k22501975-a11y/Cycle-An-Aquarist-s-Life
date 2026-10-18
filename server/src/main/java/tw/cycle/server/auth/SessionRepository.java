package tw.cycle.server.auth;

import java.time.OffsetDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface SessionRepository extends JpaRepository<Session, String> {
    @Modifying
    @Transactional
    @Query("delete from Session s where s.expiresAt < :now")
    int deleteExpired(OffsetDateTime now);
}
