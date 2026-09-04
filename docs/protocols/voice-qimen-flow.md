# 小智与奇门可信链路

## 目标

小智可以正常聊天，但涉及奇门的有利、注意、方位、建议时，只能朗读
`@seeway/control-plane` 根据当前用户、运行地点和目标时刻重新计算并通过独立
校验后的结果。语言模型不得自行排盘、决定吉凶、补充证据或把普通聊天包装成
奇门结论。

## 数据流

1. 设备先调用 `self.seeway.qimen.current_context`，取得当前同步的用户版本、
   `chartHash`、有效时段、四类摘要和证据 ID。
2. `status` 不是 `verified` 时，设备只提示“盘面仍在同步或复核”，普通聊天仍
   可继续；不得生成术数结论。
3. 语音转写后，设备调用 `self.seeway.qimen.submit_question`，同时提交问题 ID、
   原始文本和当前 `chartHash`。
4. 同步服务取走待处理请求，构造 `voice-question/v1`。控制层重新构建时间上下文、
   排盘、独立校验并生成有证据的四类摘要。
5. 设备通过 `self.seeway.qimen.response_status` 查询状态。后端结果必须是
   `voice-response/v1`，且问题 ID、`verification.status=verified`、`chartHash`
   与非空 `evidenceIds` 全部匹配，固件才接收。
6. `completed` 后，小智对 `spokenAnswer` 原样朗读，并显示 `displayText`；不得由
   语言模型改写吉凶、方向或证据。结束后回到当前时辰常亮页。
7. 用户打断时调用 `self.seeway.qimen.cancel_question`。取消后的旧响应不得重新播放。

## 失败关闭

以下任一情况都不产生奇门话术：缺少用户资料、缺少运行地点、设备没有当前
盘面、排盘或指导规则未通过验证、响应没有证据、上下文过期，或设备与后端
哈希不一致。哈希不一致统一返回 `chart_hash_mismatch`，要求先同步当前时辰。

当前服务使用运行地点的 IANA 时区生成时辰盘；出生地保留在版本化用户资料中，
不会被静默当作当前所在地。经度暂不参与真太阳时换算，除非未来单独锁定口径、
来源和黄金案例。

## 四个设备工具

| 工具 | 用途 |
| --- | --- |
| `self.seeway.qimen.current_context` | 读取受限、已校验的当前上下文 |
| `self.seeway.qimen.submit_question` | 提交文本与设备盘面哈希 |
| `self.seeway.qimen.response_status` | 获取等待、完成、阻断或取消状态 |
| `self.seeway.qimen.cancel_question` | 取消尚未完成的问题 |

固件仅保存一个活动问题，避免并发语音回答互相串线。个人奇门、市场奇门和普通
聊天使用不同路由；市场奇门在独立规则集完成前返回不可用，不借用个人盘结论。
