package tw.cycle.server.sim;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * 伺服器權威模擬（L2）：水缸模擬跑在旁邊的 Node 小服務（src/simsvc），跟遊戲用同一份 TypeScript 程式，結果一定一樣。
 * 沒有設定 SIM_SERVICE_URL 時 {@link #enabled()} 是 false，伺服器照舊只保管存檔。
 */
public interface SimClient {
    boolean enabled();

    /** 把存檔補算到 now（現實毫秒），回傳新的存檔（savedAt 是 now）。 */
    Advance advance(JsonNode save, long now);

    /**
     * 上傳的存檔跟伺服器上一份比：遊戲時間有沒有跑得比現實快、已經存在的魚身分有沒有被改、
     * 已經在市場出貨的魚（shipped）有沒有又出現。
     */
    List<Problem> verify(JsonNode previous, JsonNode next, long elapsedMs, List<Long> shipped);

    /** 在存檔裡找一條魚；item 是市場用的魚資料。 */
    Inspect inspect(JsonNode save, long fishId);

    record Advance(JsonNode save, double hours, boolean capped, int deaths, int births) {}

    record Problem(String code, String message) {}

    record Inspect(boolean found, boolean alive, JsonNode item) {}

    /** 模擬服務沒開或連不上。 */
    class Unavailable extends RuntimeException {
        public Unavailable(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
