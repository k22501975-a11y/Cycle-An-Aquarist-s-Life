package tw.cycle.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
class MarketTest {
    /** 固定的亂數：roll 決定運輸會不會死（0 一定死、0.99 不會死）。 */
    static class FixedRandom implements RandomGenerator {
        double roll = 0.99;
        /** 出貨算運輸時間的當下要做的事（模擬同時有另一個請求，例如逾期取消）。 */
        Runnable duringShip;

        @Override
        public long nextLong() {
            return 0;
        }

        @Override
        public int nextInt(int bound) {
            if (duringShip != null) duringShip.run();
            return 0;
        }

        @Override
        public double nextDouble() {
            return roll;
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }

        @Bean
        @Primary
        FixedRandom testRandom() {
            return new FixedRandom();
        }
    }

    private static final AtomicInteger SEQ = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MutableClock clock;
    @Autowired FixedRandom random;
    @Autowired JdbcTemplate db;

    record Player(String name, String token) {}

    @BeforeEach
    void reset() {
        random.roll = 0.99;
        random.duringShip = null;
    }

    private ResultActions send(MockHttpServletRequestBuilder req, Player p, String body) throws Exception {
        if (p != null) req.header("Authorization", "Bearer " + p.token());
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private Player player(String prefix) throws Exception {
        String name = prefix + SEQ.incrementAndGet();
        JsonNode res = read(send(post("/api/auth/register"), null, "{\"username\":\"" + name + "\",\"password\":\"guppy-1234\"}").andExpect(status().isCreated()));
        return new Player(name, res.get("token").asText());
    }

    /** 註冊後過了 3 天（才能上架）。 */
    private Player seasoned(String prefix) throws Exception {
        Player p = player(prefix);
        clock.advance(Duration.ofDays(3));
        return p;
    }

    /** 上架那條魚的身分欄位（更新近況、出貨時要一樣）。 */
    private static final String SAME_FISH = "\"id\":42,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":80}";

    private static String fish(int price, double health) {
        return fish(42, price, health);
    }

    private static String fish(long id, int price, double health) {
        return "{\"kind\":\"fish\",\"species\":\"guppy\",\"title\":\"藍蛇王孔雀魚 公\",\"price\":" + price
                + ",\"item\":{\"id\":" + id + ",\"species\":\"guppy\",\"sex\":\"male\",\"health\":" + health + ",\"genome\":{\"tail\":80},\"sire\":null}}";
    }

    /** 上架一條魚（id 42，出貨時用的 SAME_FISH）。 */
    private long list(Player p, int price) throws Exception {
        return list(p, 42, price);
    }

    private long list(Player p, long fishId, int price) throws Exception {
        return read(send(post("/api/market/listings"), p, fish(fishId, price, 1)).andExpect(status().isCreated())).get("id").asLong();
    }

    private JsonNode mine(Player p) throws Exception {
        return read(send(get("/api/market/mine"), p, null).andExpect(status().isOk()));
    }

    private long buy(Player p, long listing, String packaging) throws Exception {
        return read(send(post("/api/market/listings/" + listing + "/buy"), p, "{\"packaging\":\"" + packaging + "\"}").andExpect(status().isOk())).get("id").asLong();
    }

    private void ship(Player p, long order, double health) throws Exception {
        send(post("/api/market/orders/" + order + "/ship"), p, "{\"item\":{" + SAME_FISH + ",\"health\":" + health + "},\"bagTemp\":25.5,\"bagPh\":7.2}").andExpect(status().isOk());
    }

    @Test
    void 新帳號三天後才能上架_上架費一成之一() throws Exception {
        Player p = player("newbie");
        send(post("/api/market/listings"), p, fish(200, 1)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("too_new"));
        clock.advance(Duration.ofDays(3));
        send(post("/api/market/listings"), p, fish(250, 1)).andExpect(status().isCreated()).andExpect(jsonPath("$.fee").value(3));
        send(post("/api/market/listings"), p, fish(0, 1)).andExpect(status().isBadRequest());
        // 格子用完
        for (int i = 0; i < 4; i++) list(p, 100 + i, 100);
        send(post("/api/market/listings"), p, fish(200, 100, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("no_slot"));
        JsonNode m = mine(p);
        assertThat(m.get("listings")).hasSize(5);
        assertThat(m.get("slots").asInt()).isEqualTo(5);
        // 下架後空出格子
        send(delete("/api/market/listings/" + m.get("listings").get(0).get("id").asLong()), p, null).andExpect(status().isNoContent());
        list(p, 200, 100);
    }

    @Test
    void 買賣流程_託管_出貨_到貨_撥款扣稅() throws Exception {
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long id = list(amy, 300);

        // 逛市場看不到基因型，也看不到自己的商品
        JsonNode shown = read(send(get("/api/market/listings?species=guppy"), ben, null).andExpect(status().isOk()));
        JsonNode mineShown = null;
        for (JsonNode l : shown) if (l.get("id").asLong() == id) mineShown = l;
        assertThat(mineShown).isNotNull();
        assertThat(mineShown.get("item").has("genome")).isFalse();
        assertThat(mineShown.get("item").get("sex").asText()).isEqualTo("male");
        assertThat(mineShown.get("seller").get("username").asText()).isEqualTo(amy.name());
        for (JsonNode l : read(send(get("/api/market/listings"), amy, null))) assertThat(l.get("seller").get("username").asText()).isNotEqualTo(amy.name());

        // 賣家更新魚的近況
        send(put("/api/market/listings/" + id), amy, "{\"item\":{" + SAME_FISH + ",\"health\":0.9}}").andExpect(status().isNoContent());
        // 換成別條魚（基因不一樣）不行
        send(put("/api/market/listings/" + id), amy, "{\"item\":{\"id\":42,\"species\":\"guppy\",\"sex\":\"male\",\"genome\":{\"tail\":99},\"health\":1}}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("not_same_fish"));

        send(post("/api/market/listings/" + id + "/buy"), amy, "{\"packaging\":\"bag\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("own"));
        long order = buy(ben, id, "oxygen");
        send(post("/api/market/listings/" + id + "/buy"), player("cat"), "{\"packaging\":\"bag\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("gone"));

        // 賣家看得到要出哪條魚
        JsonNode sale = mine(amy).get("sales").get(0);
        assertThat(sale.get("status").asText()).isEqualTo("paid");
        assertThat(sale.get("item").get("id").asInt()).isEqualTo(42);
        assertThat(sale.get("counterpart").asText()).isEqualTo(ben.name());
        assertThat(mine(ben).get("purchases").get(0).get("item").isNull()).isTrue();

        ship(amy, order, 0.95);
        send(post("/api/market/orders/" + order + "/collect"), ben, null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_yet"));
        send(post("/api/market/orders/" + order + "/collect"), amy, null).andExpect(status().isConflict());

        clock.advance(Duration.ofHours(4));
        JsonNode got = read(send(post("/api/market/orders/" + order + "/collect"), ben, null).andExpect(status().isOk()));
        assertThat(got.get("result").asText()).isEqualTo("item");
        assertThat(got.get("item").get("health").asDouble()).isEqualTo(0.95);
        assertThat(got.get("stress").asDouble()).isBetween(0.3, 0.6);
        assertThat(got.get("bagTemp").asDouble()).isEqualTo(25.5);
        send(post("/api/market/orders/" + order + "/collect"), ben, null).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("done"));

        JsonNode paid = read(send(post("/api/market/orders/" + order + "/collect"), amy, null).andExpect(status().isOk()));
        assertThat(paid.get("result").asText()).isEqualTo("payout");
        assertThat(paid.get("amount").asInt()).isEqualTo(276);
        assertThat(mine(amy).get("sales")).isEmpty();
        assertThat(mine(ben).get("purchases")).isEmpty();

        JsonNode prices = read(send(get("/api/market/prices?species=guppy"), ben, null).andExpect(status().isOk()));
        assertThat(prices.get(prices.size() - 1).get("median").asInt()).isEqualTo(300);
    }

    @Test
    void 賣家一天沒出貨_自動取消並退款含包裝費() throws Exception {
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long order = buy(ben, list(amy, 200), "box");
        clock.advance(Duration.ofHours(25));
        assertThat(mine(amy).get("sales").get(0).get("status").asText()).isEqualTo("cancelled");
        send(post("/api/market/orders/" + order + "/ship"), amy, "{\"item\":{},\"bagTemp\":25,\"bagPh\":7}").andExpect(status().isConflict());
        JsonNode refund = read(send(post("/api/market/orders/" + order + "/collect"), ben, null).andExpect(status().isOk()));
        assertThat(refund.get("result").asText()).isEqualTo("refund");
        assertThat(refund.get("amount").asInt()).isEqualTo(320);
        assertThat(read(send(post("/api/market/orders/" + order + "/collect"), amy, null)).get("result").asText()).isEqualTo("cancelled");
    }

    @Test
    void 出貨途中訂單剛好逾期被取消_不能再出貨() throws Exception {
        // #75：出貨先讀訂單狀態、最後才寫入，中間訂單被逾期取消（買家退款）也照樣改成已出貨，賣家又拿到貨款
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long order = buy(ben, list(amy, 200), "bag");
        random.duringShip = () -> db.update("update market_order set status = 'cancelled' where id = ?", order);
        send(post("/api/market/orders/" + order + "/ship"), amy, "{\"item\":{" + SAME_FISH + ",\"health\":1},\"bagTemp\":25,\"bagPh\":7}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_paid"));
        random.duringShip = null;
        // 出貨失敗整筆回滾（模擬的取消也一起回滾），過了期限照樣是逾期取消、退款給買家
        clock.advance(Duration.ofHours(25));
        assertThat(read(send(post("/api/market/orders/" + order + "/collect"), ben, null)).get("result").asText()).isEqualTo("refund");
        assertThat(read(send(post("/api/market/orders/" + order + "/collect"), amy, null)).get("result").asText()).isEqualTo("cancelled");
    }

    @Test
    void 賣家的魚死了_取消訂單() throws Exception {
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long order = buy(ben, list(amy, 200), "bag");
        send(post("/api/market/orders/" + order + "/cancel"), amy, null).andExpect(status().isNoContent());
        assertThat(mine(amy).get("sales")).isEmpty();
        assertThat(read(send(post("/api/market/orders/" + order + "/collect"), ben, null)).get("amount").asInt()).isEqualTo(200);
    }

    @Test
    void 到貨死亡_退款給買家_賣家沒錢_信譽記一筆() throws Exception {
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long order = buy(ben, list(amy, 200), "bag");
        random.roll = 0;
        ship(amy, order, 0.5);
        clock.advance(Duration.ofHours(4));
        JsonNode refund = read(send(post("/api/market/orders/" + order + "/collect"), ben, null));
        assertThat(refund.get("result").asText()).isEqualTo("refund");
        assertThat(refund.get("reason").asText()).isEqualTo("doa");
        assertThat(read(send(post("/api/market/orders/" + order + "/collect"), amy, null)).get("result").asText()).isEqualTo("doa");

        list(amy, 43, 150);
        JsonNode seen = read(send(get("/api/market/listings?species=guppy&sort=new"), ben, null)).get(0);
        assertThat(seen.get("seller").get("doaRate").asDouble()).isEqualTo(1.0);
        assertThat(seen.get("seller").get("deals").asInt()).isEqualTo(0);
    }

    @Test
    void 更新近況和出貨時不能改魚的血統() throws Exception {
        // #75：以前只比對編號、品種、性別、基因，世代、近親係數、體質都能改了再賣
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long id = list(amy, 300);
        send(put("/api/market/listings/" + id), amy, "{\"item\":{" + SAME_FISH + ",\"generation\":9,\"health\":1}}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("not_same_fish"));
        send(put("/api/market/listings/" + id), amy, "{\"item\":{" + SAME_FISH + ",\"inbreeding\":0.5,\"health\":1}}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("not_same_fish"));
        long order = buy(ben, id, "bag");
        send(post("/api/market/orders/" + order + "/ship"), amy, "{\"item\":{" + SAME_FISH + ",\"constitution\":1.3,\"health\":1},\"bagTemp\":25,\"bagPh\":7}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("not_same_fish"));
        // 近況（健康、長大）照樣可以變
        ship(amy, order, 0.8);
    }

    @Test
    void 同一條魚不能重複上架_下架或訂單取消後可以再上架_出貨後就不行() throws Exception {
        // #75：以前同一條魚可以上架好幾次、賣好幾次（魚被複製）
        Player amy = seasoned("amy");
        Player ben = player("ben");
        long first = list(amy, 300);
        send(post("/api/market/listings"), amy, fish(300, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_listed"));

        // 下架：魚還在缸裡，可以再上架
        send(delete("/api/market/listings/" + first), amy, null).andExpect(status().isNoContent());
        long second = list(amy, 300);
        // 賣出但賣家取消訂單（魚死了或不見了）：也放回來
        send(post("/api/market/orders/" + buy(ben, second, "bag") + "/cancel"), amy, null).andExpect(status().isNoContent());
        long third = list(amy, 300);
        // 超過期限沒出貨被取消：一樣放回來
        buy(ben, third, "bag");
        clock.advance(Duration.ofHours(25));
        mine(amy);
        long fourth = list(amy, 300);
        // 賣出還沒出貨：不能再上架
        long order = buy(ben, fourth, "bag");
        send(post("/api/market/listings"), amy, fish(300, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_listed"));
        // 出貨了：魚已經不是賣家的，永遠不能再上架
        ship(amy, order, 1);
        clock.advance(Duration.ofDays(7));
        send(post("/api/market/listings"), amy, fish(300, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already_listed"));
        // 別人的 42 號魚不受影響（魚的編號是每個存檔自己的）
        list(seasoned("cat"), 300);
        // 新遊戲後同編號的另一條魚（基因不一樣）可以上架
        send(post("/api/market/listings"), amy, fish(300, 1).replace("\"tail\":80", "\"tail\":81")).andExpect(status().isCreated());
    }

    @Test
    void 下載我的資料包含市場紀錄() throws Exception {
        Player amy = seasoned("amy");
        list(amy, 123);
        JsonNode data = read(send(get("/api/me/export"), amy, null).andExpect(status().isOk()));
        assertThat(data.get("marketListings").get(0).get("price").asInt()).isEqualTo(123);
    }
}
