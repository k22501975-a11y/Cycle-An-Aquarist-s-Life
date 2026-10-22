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
     * 已經在市場出貨的魚（shipped：市場用的魚資料，編號＋身分都一樣才算同一條）有沒有又出現、
     * 新出現的魚基因生不生得出來、買不買得到（received：市場買到的魚的基因和精子，是這些就不用照店魚的範圍查）。
     * previous 是 JSON null：沒有上一份可比，只看這份自己可不可能。
     * untraced：之前記下的來歷查不到的魚（編號＋基因），牠們生的小魚也查不到。回傳的 lineage_unknown 不擋存檔，fish 是那尾的編號＋基因。
     */
    List<Problem> verify(JsonNode previous, JsonNode next, long elapsedMs, List<JsonNode> shipped, List<JsonNode> received, List<JsonNode> untraced);

    /** 在存檔裡找一條魚；item 是市場用的魚資料。 */
    Inspect inspect(JsonNode save, long fishId);

    /**
     * 買家存檔裡市場買來的魚到貨後的狀況（src/sim/arrivals.ts）：order 是市場訂單編號，item 是伺服器出貨的那份魚資料
     * （看出貨時帶著什麼病，不信買家的）。
     */
    List<Arrival> arrivals(JsonNode save, List<ArrivalQuery> orders);

    record Advance(JsonNode save, double hours, boolean capped, int deaths, int births) {}

    record Problem(String code, String message, JsonNode fish) {
        public Problem(String code, String message) {
            this(code, message, null);
        }
    }

    record Inspect(boolean found, boolean alive, JsonNode item) {}

    record ArrivalQuery(long order, JsonNode item) {}

    /** status：alive、died、gone、unknown（存檔裡查不到）。survived 是活過 30 天；sellerFault 是死於出貨時就帶著的病。 */
    record Arrival(long order, String status, boolean survived, boolean sellerFault) {}

    /** 模擬服務沒開或連不上。 */
    class Unavailable extends RuntimeException {
        public Unavailable(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
