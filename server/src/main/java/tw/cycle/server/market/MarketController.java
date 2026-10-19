package tw.cycle.server.market;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;

@RestController
@RequestMapping("/api/market")
public class MarketController {
    private final MarketService market;

    public MarketController(MarketService market) {
        this.market = market;
    }

    /** baseRevision：遊戲端手上那份雲端存檔的版本（錢由伺服器直接改雲端存檔，docs/ledger.md §3.3）。 */
    public record ListBody(@NotBlank String kind, @NotBlank String species, @NotBlank String title, @NotNull JsonNode item, int price, Long baseRevision) {}

    public record ItemBody(@NotNull JsonNode item) {}

    public record BuyBody(@NotBlank String packaging, Long baseRevision) {}

    public record CollectBody(Long baseRevision) {}

    public record ShipBody(@NotNull JsonNode item, double bagTemp, double bagPh) {}

    @GetMapping("/listings")
    public List<MarketService.Listing> browse(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me,
                                              @RequestParam(required = false) String species, @RequestParam(required = false) String sort) {
        return market.browse(me, species, sort);
    }

    @PostMapping("/listings")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> list(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody ListBody body) throws Exception {
        return market.list(me, body.kind(), body.species(), body.title(), body.item(), body.price(), body.baseRevision());
    }

    @PutMapping("/listings/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id, @Valid @RequestBody ItemBody body) throws Exception {
        market.update(me, id, body.item());
    }

    @DeleteMapping("/listings/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id) {
        market.cancel(me, id);
    }

    @PostMapping("/listings/{id}/buy")
    public MarketService.Bought buy(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id, @Valid @RequestBody BuyBody body) throws Exception {
        return market.buy(me, id, body.packaging(), body.baseRevision());
    }

    @GetMapping("/mine")
    public MarketService.Mine mine(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me) {
        return market.mine(me);
    }

    @PostMapping("/orders/{id}/ship")
    public MarketService.Order ship(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id, @Valid @RequestBody ShipBody body) throws Exception {
        return market.ship(me, id, body.item(), body.bagTemp(), body.bagPh());
    }

    @PostMapping("/orders/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void sellerCancel(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id) {
        market.sellerCancel(me, id);
    }

    @PostMapping("/orders/{id}/collect")
    public Map<String, Object> collect(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @PathVariable long id,
                                       @RequestBody(required = false) CollectBody body) throws Exception {
        return market.collect(me, id, body == null ? null : body.baseRevision());
    }

    @GetMapping("/prices")
    public List<MarketService.PricePoint> prices(@RequestParam String species) {
        return market.prices(species);
    }
}
