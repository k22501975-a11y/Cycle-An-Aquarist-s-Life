/**
 * 阿德老闆的表情（polish-to-9.md V1）：照他說的話換頭像。
 * 壞消息、提醒 → 擔心；「哇」「快生了」 → 驚訝；做到了、達成 → 得意；歡迎、謝謝、好消息 → 開心；其他用平常的頭像。
 * 先看擔心：同一句裡有壞消息又有「不錯」時，擔心比較不會讓玩家誤會。
 */
export type OwnerMood = 'calm' | 'happy' | 'worried' | 'surprised' | 'proud';

const WORRIED = /有點狀況|留意|死|病|危險|小心|不舒服|氨|亞硝|太多|太少|太熱|太冷|太高|太低|糟|注意|警告|白點|浮頭|缺氧|停電|爛|餓|不要|別急|撐不|來不及|救/;
const SURPRISED = /哇|咦|欸|居然|竟然|天啊|？！|！？|快生了|生了！|第一次/;
const PROUD = /做得好|厲害|不錯|漂亮|恭喜|完成|達成|成功|養好了|做到了|好樣的|有你的|專家/;
const HAPPY = /歡迎|謝謝|喜歡|可愛|開心|太好了|好消息|賺|入帳|\+\d/;

export function ownerMood(text: string): OwnerMood {
  if (WORRIED.test(text)) return 'worried';
  if (SURPRISED.test(text)) return 'surprised';
  if (PROUD.test(text)) return 'proud';
  if (HAPPY.test(text)) return 'happy';
  return 'calm';
}
