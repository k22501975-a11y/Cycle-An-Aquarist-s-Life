package tw.cycle.server.config;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.random.RandomGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class Beans {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    /** 市場運輸結果（到貨死亡、運輸時間）用的亂數；測試時換成固定的。 */
    @Bean
    RandomGenerator random() {
        return new SecureRandom();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
