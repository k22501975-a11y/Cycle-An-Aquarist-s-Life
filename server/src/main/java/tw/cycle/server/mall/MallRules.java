package tw.cycle.server.mall;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/** 儲值方案和商城道具（design/monetization.md）。點數只能買這裡列的東西，不能換成遊戲幣。 */
public final class MallRules {
    public static final ZoneId ZONE = ZoneId.of("Asia/Taipei");
    /** 每個帳號每個月最多儲值多少台幣（保護未成年玩家，避免一時衝動花太多）。 */
    public static final int MONTHLY_TOPUP_LIMIT_TWD = 5000;

    private MallRules() {}

    public record Pack(String id, int twd, int points) {}

    /** 一次買越多送越多。 */
    public static final Map<String, Pack> PACKS = new LinkedHashMap<>();

    /** daily：每天最多買幾個（台北時間），0 表示不限。 */
    public record Item(String id, String name, String note, int points, int daily) {}

    public static final Map<String, Item> ITEMS = new LinkedHashMap<>();

    static {
        for (Pack p : new Pack[] {new Pack("p30", 30, 30), new Pack("p150", 150, 155), new Pack("p300", 300, 320), new Pack("p990", 990, 1080), new Pack("p1990", 1990, 2200)})
            PACKS.put(p.id(), p);
        for (Item i : new Item[] {
                new Item("cure", "特效藥", "讓一尾魚的症狀馬上消退、恢復一些體力；只治症狀，水裡的病原和水質問題還在，水質造成的傷效果減半", 30, 3),
                new Item("tankset", "熟成套缸", "40 L 套缸，濾材已經養好，種好水草、放了 6 尾普通孔雀魚；之後還是要好好照顧", 150, 1)})
            ITEMS.put(i.id(), i);
    }
}
