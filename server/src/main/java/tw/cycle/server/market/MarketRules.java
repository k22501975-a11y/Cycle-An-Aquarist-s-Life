package tw.cycle.server.market;

import java.time.ZoneId;
import java.util.Map;

/** 玩家市場的數字（market-and-breeding.md §3.4、§3.5）；之後要調整都改這裡。 */
public final class MarketRules {
    private MarketRules() {}

    public static final ZoneId ZONE = ZoneId.of("Asia/Taipei");
    /** 遊戲時間是現實的幾倍（GAME_DESIGN 第 14 節：7 倍速）。 */
    public static final int TIME_SCALE = 7;
    /** 上架費：售價的 1%，最少 1 元，不退。 */
    public static final double LISTING_FEE = 0.01;
    /** 成交稅：成交價的 8%，賣家付。 */
    public static final double TAX = 0.08;
    public static final int MIN_PRICE = 1;
    public static final int MAX_PRICE = 1_000_000;
    /** 初始上架格數；每成功出貨 10 筆多 1 格。 */
    public static final int BASE_SLOTS = 5;
    public static final int MAX_SLOTS = 15;
    /** 賣家多久沒出貨就自動取消、退款給買家（現實小時）。 */
    public static final int SHIP_DEADLINE_HOURS = 24;
    /** 運輸時間（遊戲小時）。 */
    public static final int MIN_TRANSIT_HOURS = 6;
    public static final int MAX_TRANSIT_HOURS = 24;
    /** 行情看最近幾天的成交。 */
    public static final int PRICE_DAYS = 14;
    /** 一件商品的資料最多幾個字元。 */
    public static final int MAX_ITEM_CHARS = 20_000;
    /** 一筆水草最多幾株插枝（遊戲一次上架 5 株）。 */
    public static final int MAX_CUTTINGS = 5;
    /** 到貨死亡率超過這個比例（至少 5 筆）就在商品頁警示。 */
    public static final double DOA_WARNING = 0.15;
    /** 到貨 30 天存活率低於這個比例（至少 5 筆有結果）就在商品頁警示：常有魚到貨後發病死掉。 */
    public static final double SURVIVAL_WARNING = 0.8;
    /** 到貨後幾天（現實）內的訂單才在買家上傳存檔時查（遊戲 30 天約現實 4.3 天，留寬一點）；之後還查不到就不再查。 */
    public static final int ARRIVAL_CHECK_DAYS = 14;
    /** 一次上傳最多查幾筆。 */
    public static final int ARRIVAL_BATCH = 50;

    /** 包裝：價錢（買家付）、運輸死亡風險倍數、到貨時的緊迫。 */
    public record Packaging(int cost, double risk, double stress) {}

    public static final Map<String, Packaging> PACKAGING = Map.of(
            "bag", new Packaging(0, 1.0, 0.45),
            "oxygen", new Packaging(30, 0.4, 0.3),
            "box", new Packaging(120, 0.15, 0.2));

    public static int listingFee(int price) {
        return Math.max(1, (int) Math.round(price * LISTING_FEE));
    }

    public static int payout(int price) {
        return price - (int) Math.round(price * TAX);
    }

    public static int slots(int delivered) {
        return Math.min(MAX_SLOTS, BASE_SLOTS + delivered / 10);
    }

    /**
     * 運輸途中死亡的機率：健康的魚用普通袋運 15 小時約 3%，充氧袋 1.2%，保溫箱 0.5%。
     * 健康低於 80% 風險快速升高；蝦比魚怕運輸。水草不會死在路上。
     */
    public static double doaChance(String kind, String species, double health, Packaging pack, int transitHours) {
        if (!"fish".equals(kind)) return 0;
        double frail = species.endsWith("shrimp") ? 1.5 : 1.0;
        double p = pack.risk() * (0.03 + 0.6 * Math.max(0, 0.8 - health)) * (transitHours / 15.0) * frail;
        return Math.min(0.95, p);
    }

    /** 到貨時的緊迫：包裝越好越低，路上越久越高。 */
    public static double arrivalStress(Packaging pack, int transitHours) {
        return Math.min(1, pack.stress() + 0.01 * transitHours);
    }
}
