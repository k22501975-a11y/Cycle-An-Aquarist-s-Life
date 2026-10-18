package tw.cycle.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 水族人生的後端：帳號與雲端存檔（GAME_DESIGN 第 12 節 Phase 2）。 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class CycleServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(CycleServerApplication.class, args);
    }
}
