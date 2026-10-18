package tw.cycle.server.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);
}
