package tw.cycle.server.push;

import java.net.URI;
import java.util.Map;

/** 把加密好的通知 POST 給推播服務，回傳 HTTP 狀態碼。測試時換成假的。 */
public interface PushTransport {
    int post(URI endpoint, Map<String, String> headers, byte[] body) throws Exception;
}
