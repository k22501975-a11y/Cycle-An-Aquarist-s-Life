package tw.cycle.server.social;

import java.time.ZoneId;

/** 好友玩法的數字（friends.md）；之後要調整都改這裡。 */
public final class SocialRules {
    private SocialRules() {}

    /** 每日額度以台灣時間的日期算。 */
    public static final ZoneId ZONE = ZoneId.of("Asia/Taipei");
    public static final int MAX_FRIENDS = 50;
    /** 每天送出、收到各最多幾點贈禮。 */
    public static final int DAILY_SEND_POINTS = 20;
    public static final int DAILY_RECEIVE_POINTS = 20;
    /** 一段好友關係每天最多加幾點交情。 */
    public static final int DAILY_AFFINITY = 3;
    /** 一次最多送幾株插枝。 */
    public static final int MAX_CUTTINGS = 10;

    /** 交情等級：1 魚友、2 熟識、3 好友、4 摯友。 */
    public static int level(int affinity) {
        if (affinity >= 60) return 4;
        if (affinity >= 25) return 3;
        if (affinity >= 8) return 2;
        return 1;
    }
}
