-- 到貨存活追蹤（L2，#76）：市場買來的魚到貨後活得怎樣，買家上傳存檔時由伺服器模擬查（src/sim/arrivals.ts）。
-- survived 活過 30 天；sick 死於出貨時就帶著的病（算賣家的）；buyer 買家自己養死的；gone 賣掉、送人（從那時起不追）。
-- 還在追、查不到紀錄的留 null：查不到不能算存活。
ALTER TABLE market_order ADD COLUMN outcome VARCHAR(8);
ALTER TABLE market_order ADD COLUMN outcome_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX market_order_outcome ON market_order(seller_id, outcome);
