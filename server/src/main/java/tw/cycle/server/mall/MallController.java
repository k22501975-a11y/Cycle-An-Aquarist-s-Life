package tw.cycle.server.mall;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;

@RestController
@RequestMapping("/api/points")
public class MallController {
    private final MallService mall;

    public MallController(MallService mall) {
        this.mall = mall;
    }

    public record TopupBody(@NotBlank String pack) {}

    public record BuyBody(@NotBlank String item) {}

    public record UseBody(@NotBlank String item, @NotNull UUID requestId) {}

    @GetMapping
    public MallService.Catalog catalog(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me) {
        return mall.catalog(me);
    }

    @PostMapping("/topup")
    public Map<String, Object> topup(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody TopupBody body) {
        return Map.of("balance", mall.topup(me, body.pack()));
    }

    @PostMapping("/buy")
    public Map<String, Object> buy(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody BuyBody body) {
        MallService.Grant grant = mall.buy(me, body.item());
        return Map.of("grant", grant, "balance", mall.balance(me), "bag", mall.bag(me));
    }

    @PostMapping("/use")
    public MallService.Used use(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me, @Valid @RequestBody UseBody body) {
        return mall.use(me, body.item(), body.requestId());
    }

    @GetMapping("/history")
    public List<MallService.Entry> history(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long me) {
        return mall.history(me);
    }
}
