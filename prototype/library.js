// The two user examples are credited separately from the original Chinese
// templates inspired by the linked publisher guides.
window.PROMPT_LIBRARY = [
  {
    id: "project-reader",
    category: "开发",
    title: "读懂一个 GitHub 项目",
    description: "替换任务、平台和项目地址，开始一次项目阅读。",
    body: "详细阅读并【例：学习/部署】【例：GitHub】上的【例：https://github.com/Vincentwei1021/video-shotcraft】项目。",
    source: { name: "用户提供的示例", url: "" }
  },
  {
    id: "deepen-question",
    category: "研究",
    title: "把问题问得更深",
    description: "从专家的追问、一手材料和验证方法入手，重写题目。",
    body: `我的题目是“【例：怎样判断一次图书馆导览是否帮助新生独立找书】”。请保留这个范围，把研究做得更深入。

重写前，先回答四个问题：
1. 【例：图书馆用户研究】领域的顶尖专家，还会追问或检查哪些我没有提到的事情？
2. 专家会亲自查看哪些原始材料？说明从哪里取得、该看什么细节。
3. 针对每个关键问题，列出具体方法、工具和可以交付的结果。
4. 除了你我的判断，什么独立证据可以检验结果？出现什么观察时应当修改结论？

最后给出一个修改后的题目，把最重要的验证条件写进去。`,
    source: { name: "根据用户提供的示例整理", url: "" }
  },
  {
    id: "storyboard",
    category: "视频",
    title: "把口播拆成分镜",
    description: "为每句口播匹配可拍摄的画面、动作和秒数。",
    body: `请把下面的口播拆成【例：30 秒】的分镜脚本，按【例：9:16 竖屏】构图。
口播原文：【例：清晨的面包店先醒来的是烤箱。第一盘出炉时，街角才有了人声。】
每行写一个镜头，列出起止秒数、对应原句、景别、主体动作和镜头运动。动作要能在分配的时间内看清。最后核对总时长，并标出最适合保留现场声的镜头。`,
    source: { name: "Google Cloud · Veo 分镜与时间段", url: "https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1" }
  },
  {
    id: "social-post",
    category: "文案",
    title: "写一条活动招募文案",
    description: "面向指定读者，把活动事实写成可以发布的短文。",
    body: `我要在【例：社区公众号】邀请【例：周末想带孩子散步的家长】参加活动。
已确认的信息：【例：周六上午九点在北门集合，步行约一小时，自带饮水】。
请给出一个标题和一段正文。用一个读者会关心的具体细节开头，结尾请读者【例：在评论区留言报名】。时间、费用和名额只写我已提供的信息。`,
    source: { name: "Google Workspace · 营销文案", url: "https://workspace.google.com/resources/ai/prompts-for-marketing/" }
  },
  {
    id: "meeting-actions",
    category: "办公",
    title: "从会议里提取行动项",
    description: "还原已定事项、负责人、期限和待确认的问题。",
    body: `请整理这段会议记录：【例：小林说周四发样稿。阿宁建议换封面，大家同意等样稿出来再定。】
先用一句话概括会议结论，再列出任务、负责人、截止时间和对应原句。把提议和已确定的任务分开，原文没交代的字段填“待确认”。最后列出下次会议需要回答的问题。`,
    source: { name: "Microsoft · Teams 会议提示", url: "https://support.microsoft.com/en-us/teams/copilot/catch-up-on-meetings-with-microsoft-365-copilot-in-teams" }
  },
  {
    id: "evidence-comparison",
    category: "研究",
    title: "对照两份材料的证据",
    description: "逐项比较主张、适用条件和原文依据。",
    body: `围绕“【例：周末是否应延长自习室开放时间】”比较两份材料。
材料甲：【例：四月的门禁记录显示，闭馆前半小时仍有三十人使用自习室。】
材料乙：【例：三月的读者问卷中，二十位受访者表示希望周六晚延长开放。】
做一张对照表，每行只放一个主张，附上两份材料各自的原句或位置。区分观察到的行为和被访者的意向，指出能相互印证的内容、暂时无法比较的内容，以及还需要哪项记录。`,
    source: { name: "Google · NotebookLM 原文核对", url: "https://blog.google/innovation-and-ai/technology/ai/notebooklm-google-ai/" }
  },
  {
    id: "video-single-shot",
    category: "视频",
    title: "描述一个视频镜头",
    description: "把主体、动作、机位和光线合成一个清晰的镜头。",
    body: `请把我的想法写成一段可交给视频生成工具的中文镜头描述。
主体与动作：【例：陶艺师转动拉坯盘，用指腹修整杯口】。
摄影设定：【例：侧面近景，机位固定，傍晚的窗光】。
时长为【例：6 秒】。把动作按发生顺序写清楚，交代镜头开始和结束时主体各在做什么。只输出一段可直接使用的描述。`,
    source: { name: "Google Cloud · 视频提示词指南", url: "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide" }
  },
  {
    id: "code-review",
    category: "开发",
    title: "审查一次代码改动",
    description: "根据调用方约定，定位有证据的行为回归。",
    body: `请审查这次改动，优先关注【例：已有调用方的返回值是否发生变化】。
改动说明与代码：【例：函数原约定是空列表返回 0，新实现直接返回 values[0]。】
每条意见都写明触发条件、实际影响、对应代码与最小修复建议。区分已能从代码确认的问题和需要运行后才能判断的问题，最后给出最值得先跑的一个测试。`,
    source: { name: "GitHub Docs · 代码审查", url: "https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files/review-code" }
  },
  {
    id: "landing-copy",
    category: "文案",
    title: "写产品介绍页首屏",
    description: "从产品事实中提炼主标题、说明和按钮文字。",
    body: `产品能做到这些事：【例：离线收藏常用提示词，填入变量后复制到剪贴板】。
请为【例：每天反复使用同类提示词的创作者】写一组网页首屏文案。提供主标题、简短说明和一个按钮文字。主标题写使用者能完成的具体事情，按钮对应的动作是【例：打开模板库】。只采用上述事实支持的表述。`,
    source: { name: "Google Workspace · 营销文案", url: "https://workspace.google.com/resources/ai/prompts-for-marketing/" }
  },
  {
    id: "weekly-update",
    category: "办公",
    title: "整理一份周报",
    description: "从工作流水中找出已交付的结果和需要协调的事项。",
    body: `请根据我的记录，给【例：产品负责人】写本周进展。
工作记录：【例：完成搜索页原型并评审；接口文档待后端确认；周一约了三位用户试用。】
开头先说本周交付了什么，然后各用一句交代尚待解决的问题、需要谁协助、下周的首要任务。避免把计划写成已完成的成果。`,
    source: { name: "Google Workspace · 项目管理", url: "https://workspace.google.com/resources/ai/prompts-for-project-management/" }
  },
  {
    id: "research-brief",
    category: "研究",
    title: "核对材料中的结论",
    description: "让每个结论都能回到原文，并标明支持程度。",
    body: `我想核对这个结论：“【例：延长晚间开放后，所有年级的到馆人数都上升了】”。
原始材料：【例：一楼晚八点后的进馆记录由四月的 120 次增至五月的 160 次，读卡器没有记录年级。】
请把结论拆成可单独验证的陈述，为每一项列出原文依据，标明“支持／矛盾／材料不足”。最后用一句话写出当前材料能够支持的最具体结论。`,
    source: { name: "Google · NotebookLM 原文核对", url: "https://blog.google/innovation-and-ai/technology/ai/notebooklm-google-ai/" }
  },
  {
    id: "photo-to-motion",
    category: "视频",
    title: "让参考图动起来",
    description: "为静态首帧设计主体动作、环境变化和运镜。",
    body: `我会提供一张【例：窗边摆着一盆薄荷】的参考图作为首帧。请写一条图生视频提示词，镜头持续【例：5 秒】。
我想看到的变化是【例：窗帘轻轻掀起，薄荷叶先后摆动】。描述动作开始的时机、方向、幅度和镜头运动，沿用首帧中的物体与位置。只输出可直接粘贴的镜头指令。`,
    source: { name: "Google Cloud · 图生视频建议", url: "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice?hl=en" }
  },
  {
    id: "email-subjects",
    category: "文案",
    title: "换三个邮件标题",
    description: "根据同一封邮件的内容，试写三个不同切入点。",
    body: `邮件发给【例：报名了线下工作坊的学员】。邮件正文要点是【例：场地改到二楼展厅，请提前十分钟入场，原预约仍有效】。
请写三个适合手机收件箱的标题，分别突出最重要的变化、收件人要做的事和便于日后检索的关键词。每条不超过【例：20 个汉字】，保留准确的时间与地点。`,
    source: { name: "Google Workspace · 营销文案", url: "https://workspace.google.com/resources/ai/prompts-for-marketing/" }
  },
  {
    id: "unit-test-cases",
    category: "开发",
    title: "为函数列测试用例",
    description: "用正常、边界和异常输入检查约定行为。",
    body: `根据这段函数约定设计测试用例：【例：取非空数字列表的中位数，空列表抛出 ValueError】。
技术栈为【例：Python / pytest】。先列“场景、输入、期望结果”三列，再给出可以直接移入测试文件的代码。覆盖会暴露实现错误的边界值。若约定有歧义，把待确认的问题单列出来。`,
    source: { name: "GitHub Docs · 生成单元测试", url: "https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files/generate-unit-tests" }
  },
  {
    id: "decision-email",
    category: "办公",
    title: "写一封请对方决策的邮件",
    description: "把背景、可选方案和需要的回复写在一封邮件里。",
    body: `请根据以下事实给【例：工作坊负责人】写一封邮件。
背景：【例：原定周五的教室只能坐十二人，已有十八人报名；周四的大教室仍空闲。】
希望对方【例：今天下班前确认换到周四，或保留周五并分两场】。
给出邮件主题和正文。第一句交代需要对方决定的事项，随后用简短条目呈现选择和已知影响，结尾重申回复时间。`,
    source: { name: "Google Workspace · 有效提示词指南", url: "https://workspace.google.com/resources/ai/writing-effective-prompts/" }
  },
  {
    id: "try-on-street",
    category: "视频",
    title: "街头穿搭实拍脚本",
    description: "用穿脱和行走展示衣服的剪裁与细节。",
    body: "请为【例：一件带反光条的深灰通勤外套】设计【例：地铁口到街角咖啡馆的 25 秒竖屏穿搭片】。从衣架上的衣服切到上身，安排能看清活动余量、口袋位置和背面的镜头。写出每次转身或切景的动机，附手持拍摄的站位和一条自然口播。",
    source: { name: "MiniMax Design · MiniMax 工服街头上身（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "landscape-brand-film",
    category: "视频",
    title: "为品牌片设计风景叙事",
    description: "把景物、现场声和品牌出现的时机串成一条线。",
    body: "【例：山里做手工纸的作坊】想拍【例：40 秒、没有采访的形象片】。以一种反复出现的声音连接三个场景，先写它怎样从环境声变成工序的线索，再画出开头、转折和收束各一幅关键画面的文字草图。给品牌名安排一次有来由的露出。",
    source: { name: "MiniMax Design · 山间有令（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "product-speed-film",
    category: "视频",
    title: "拍出静物的速度感",
    description: "用相对运动、光线和声音安排节奏。",
    body: "为【例：城市通勤自行车】写一支【例：15 秒横屏】速度感广告的拍摄方案。实际只有【例：停车棚、一条封闭车道和一盏可移动灯】。用近景的运动线索过渡到全景，逐镜列机位、画面里的移动方向、声音切点和应当留给产品识别的停顿。",
    source: { name: "MiniMax Design · 极速之境（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "comic-continuity",
    category: "视频",
    title: "给连载漫剧做连续性设定",
    description: "锁住人物与关键道具，逐格检查变化。",
    body: "将【例：姐姐递出紫围巾，妹妹发现围巾背面有一行字】拆成【例：四格竖屏漫剧】。先列出两人的识别特征、左右站位和道具归属，再为每格写构图、视线和台词框位置。标出哪一格第一次露出字迹，检查围巾与持物手能否连续接上。",
    source: { name: "MiniMax Design · 妹妹说紫色很有韵味（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "vertical-drama-reveal",
    category: "视频",
    title: "设计竖屏短剧的反转",
    description: "靠画面线索铺垫误会和揭晓。",
    body: "把【例：收件人以为拿错包裹，最后发现是邻居修好的旧收音机】写成【例：35 秒、两人、一处楼道】的短剧。前五秒留下一个能回看的视觉线索，交代观众何时比角色多知道一件事。按场次给出动作、台词、反应镜头和结尾停帧。",
    source: { name: "MiniMax Design · 真千金归来（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "ugc-proof",
    category: "视频",
    title: "用实拍动作证明一个卖点",
    description: "用同场对照展示产品表现，分清体验和承诺。",
    body: "我要用手机演示【例：杯盖可以单手开合】，给【例：常在桌前工作的人】看。请写一个亲历感的三段短片，开头给出具体麻烦，中段让完整操作在同一机位发生，结尾交代使用条件。给两种可拍的开场和一句能由画面本身核对的口播。",
    source: { name: "MiniMax Design · 中文 UGC 带货（案例启发）", url: "https://design.minimax.cn/#creative-showcase" }
  },
  {
    id: "music-video-beats",
    category: "视频",
    title: "按歌词和节拍编排画面",
    description: "给副歌留出视觉转折和重复意象。",
    body: "原歌词是【例：灯亮以前，我听见河岸的脚步；灯亮以后，我们往回走】，音乐结构为【例：四拍前奏、八拍主歌、八拍副歌】。按小节设计画面，把一个意象在副歌重新解释。标出切点、运镜、留白和需要等听到音乐后才能确定的节拍。",
    source: { name: "MiniMax Design · MV 创作（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "character-design-board",
    category: "视频",
    title: "用一页设定板对齐剧组",
    description: "把文字剧本转成可供连续拍摄的视觉约束。",
    body: "根据角色【例：退休修表师，旧围裙上有两个补丁】和场景【例：雨夜店内，窗外是暖色路灯】，写一页可发给美术和摄影的角色场景板。列全身轮廓、手部特写、道具尺寸参照和空间平面关系，再写三张参考图的生成描述，统一光源方向。",
    source: { name: "MiniMax Design · 角色场景分镜板（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "motion-countdown",
    category: "视频",
    title: "做一段可复用的倒数片头",
    description: "把画面变化换算为帧和文字安全区。",
    body: "为【例：城市夜跑直播】写【例：25 帧每秒、三秒倒数接一秒标题】的动态图形规格。逐段给出帧区间、数字的位置和运动曲线。为静音播放保留视觉提示，同时给不喜欢强动效的观众设计淡化版，校验末帧能与直播画面接上。",
    source: { name: "prompts.chat · 8 票（2026-11-26）", url: "https://prompts.chat/prompts/cmkqvwms6000hlb04f7cbruio" }
  },
  {
    id: "cinematography-grid",
    category: "视频",
    title: "给同一场景比较摄影方案",
    description: "固定剧情，用分镜对比光线、机位和情绪。",
    body: "参考画面是【例：闭馆后的阅览室，一个人站在空书架前】。为【例：从安心到不安】做四格摄影比较。每格保持人物、道具和事件相同，只换一个主要手段。分别写镜头位置、光源方向、观众先注意的细节和适用剧情，并选一格说明理由。",
    source: { name: "prompts.chat · 13 票（2026-11-26）", url: "https://prompts.chat/prompts/cmj2yc3sk0001un0stwt431nj" }
  },
  {
    id: "accessible-captions",
    category: "视频",
    title: "整理带声效提示的字幕",
    description: "补上听不到声音时会错过的信息。",
    body: "按【例：00:00–00:03 门铃两声；00:03–00:06 镜外阿青说“留个灯”】生成【例：简体中文 SRT】。保留给定时间点，区分说话者和有叙事作用的环境声。长句按语义换行，交付前复查编号、时间码、重叠区间及读不完的字幕。",
    source: { name: "W3C WAI · 视频字幕", url: "https://www.w3.org/WAI/media/av/captions/" }
  },
  {
    id: "audio-description",
    category: "视频",
    title: "在对白空隙里写口述影像",
    description: "选择会影响理解的动作和场景变化。",
    body: "画面记录：【例：00:02 小周把钥匙放进红袋；00:06 另一人拿走蓝袋】。对白在【例：00:00–00:02 和 00:04–00:06】。请按可用空隙写口述影像稿，保留关键的颜色、动作和顺序，每段标明时间窗。装不下的信息另列剪辑建议。",
    source: { name: "W3C WAI · 无障碍视听内容", url: "https://www.w3.org/WAI/media/av/" }
  },
  {
    id: "sound-sheet",
    category: "视频",
    title: "给剪辑师列声音提示单",
    description: "区分对白、环境和有转场作用的音效。",
    body: "场景为【例：深夜洗衣房，转筒逐渐停下，随后有人推门】，成片【例：18 秒，首尾使用同一段房间底噪】。按时间区间排对白、环境声和拟音，注明声音从哪里来、何时进出、哪一个声音应当抢先于画面。最后列出现场需要另录的三段声音。",
    source: { name: "Google Cloud · Veo 视频提示词实例", url: "https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1" }
  },
  {
    id: "extend-shot",
    category: "视频",
    title: "用首尾画面约束转场",
    description: "明确两张参考图之间可发生的动作。",
    body: "首帧是【例：镜头俯看摊开的蓝色地图】，尾帧是【例：蓝色湖面占满屏幕】。为【例：5 秒无硬切】写一条首尾帧转场提示词。交代镜头轨迹、颜色如何衔接、哪一刻地图边缘消失；另列容易闪烁或变形的细节和一条简化方案。",
    source: { name: "Google Cloud · Veo 视频提示词实例", url: "https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1" }
  },
  {
    id: "shorten-cut",
    category: "视频",
    title: "把长片改成多时长版本",
    description: "用原时间码定位必留镜头和可删段落。",
    body: "原片镜头表为【例：00–06 开箱，06–15 安装，15–24 开灯，24–30 收尾】。要做【例：15 秒和 6 秒】两个版本，观众一定要看见【例：灯点亮前后的差别】。交付两个剪辑单，标明原片入出点、台词处理、缺的连接画面，并核算各版时长。",
    source: { name: "MiniMax Design · 宣传视频（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "podcast-dialogue",
    category: "视频",
    title: "把知识点写成双人播客短片",
    description: "用追问和例子替代轮流背台词。",
    body: "用【例：猫主播和爱刨根问底的乌鸦来宾】讲清【例：保温杯为什么要留一层真空】。写成【例：一分钟】对话短片。让来宾提出一个日常反例，主持人用能在桌面上演示的比喻回答。每轮附一个画面动作，最后注明比喻在哪一点停止适用。",
    source: { name: "MiniMax Design · 动物播客（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "voice-casting",
    category: "视频",
    title: "为多角色配音标注声线",
    description: "拆开叙述、台词和呼吸停顿。",
    body: "把这段故事改成可录音的分轨台本：【例：小周说“先听完”，奶奶把音量拧小。这时收音机里传来一句“回家吧”。】面向【例：睡前故事听众】，列角色、台词、接话关系、节奏和重音。每个角色给一句试音，并说明旁白与台词之间怎样留出空间。",
    source: { name: "MiniMax Design · 有声书（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "rewrite-plain",
    category: "文案",
    title: "把行话改成读者会说的话",
    description: "保留事实、条件和原有语气，删去空话。",
    body: "请把这段文字发给【例：第一次办借书证的新读者】：“【例：完成身份信息维护后即可实现借阅权益的正式激活。】”先给一版可以直接发布的短文，再列三处删改及原因。保留必要条件，核对读者读完后能否说出要做什么。",
    source: { name: "prompts.chat · 6 票（2026-11-26）", url: "https://prompts.chat/prompts/cmj2o5n930004xv0rc6uj6xt8" }
  },
  {
    id: "store-localization",
    category: "文案",
    title: "本地化应用商店介绍",
    description: "让功能名、搜索词和行动措辞适合目标市场。",
    body: "为【例：离线剪贴板工具，支持关键字搜索和固定截图】写【例：简体中文和英语】商店介绍。输出各语言的短标题、一句话用途和前三条亮点。先建术语对照表，再按【例：标题最多 24 字符】逐项计数，避免虚构榜单成绩。",
    source: { name: "prompts.chat · 7 票（2026-11-26）", url: "https://prompts.chat/prompts/cmjl99szb0004l104mjwevo3f" }
  },
  {
    id: "campaign-angle",
    category: "文案",
    title: "为同一主题找不同传播角度",
    description: "从受众的真实选择出发比较选题。",
    body: "我们要宣传【例：旧衣交换周】，已知【例：每位参与者可带三件洗净衣物】。分别从实用、省事、意外发现三个动机拟选题，每个写标题、首句、读者可能追问的一句话和需要的证据。选择一个能用现有素材拍出来的方向，说明理由。",
    source: { name: "prompts.chat · 8 票（2026-11-26）", url: "https://prompts.chat/prompts/cmmkqhi6v6d9gegqgt9a4" }
  },
  {
    id: "newsletter-blurb",
    category: "文案",
    title: "从几条事实编一本短通讯",
    description: "按影响和截止时间排版，让读者能快速扫读。",
    body: "根据【例：周一夜读延长一小时；周三维修东门；下周五举办旧书交换】写一期给【例：社区图书馆订户】的简讯。安排主题行、预览文字和三则短消息，最需要立即行动的放在第一则。邮件预览只补充新信息，核对每条的对象和时间。",
    source: { name: "Mailchimp 文风指南 · 邮件通讯", url: "https://styleguide.mailchimp.com/writing-email-newsletters/" }
  },
  {
    id: "tone-in-difficulty",
    category: "文案",
    title: "给同一通知选择合适语气",
    description: "按读者当前处境调整解释和行动说明。",
    body: "事实是【例：预约页面今天下午维护两小时，已成功的预约仍有效】，读者是【例：刚准备提交预约的人】。分别写用于网页提示和人工回复的两个版本。第一句说明现在能做什么，后面解释影响，语气平实。列出两个可能让人误以为预约已取消的词。",
    source: { name: "Mailchimp 文风指南 · 语态和语气", url: "https://styleguide.mailchimp.com/voice-and-tone/" }
  },
  {
    id: "microcopy-error",
    category: "文案",
    title: "给表单错误写恢复指引",
    description: "把填错的原因和下一步写在字段旁。",
    body: "表单字段为【例：预约取书日期】，规则是【例：只能选择次日起七天内的开放日】。写空值、选到闭馆日、超过可预约范围的三条错误提示。每条各给字段旁短句和页首摘要，帮用户定位并修正，界面上的字段名称要一致。",
    source: { name: "GOV.UK 设计系统 · 错误信息", url: "https://design-system.service.gov.uk/components/error-message/" }
  },
  {
    id: "alt-text",
    category: "文案",
    title: "按图片在文章里的用途写替代文本",
    description: "区分传递事实的照片、图表和装饰图。",
    body: "文章要说明【例：新增无障碍通道的入口在邮局一侧】。为【例：入口实景图、通道路线示意图、页脚装饰花纹】分别写替代文本或标明应使用空替代文本。路线图另给一段正文可读的路线说明；遇到示意图没有给出的地点请标出待核对。",
    source: { name: "W3C WAI · 图片替代文本", url: "https://www.w3.org/WAI/tutorials/images/" }
  },
  {
    id: "social-adapt",
    category: "文案",
    title: "把活动信息改写成三个平台版本",
    description: "让篇幅、开场和行动用语适应发布位置。",
    body: "已确认【例：周六湖边清洁行动，登记后自领手套，遇雨改期】。请为【例：社区公告栏、微信群和短视频置顶评论】各写一版。公告栏先说时间地点，群消息便于转发，置顶评论先答参加办法。把缺少的信息列成发布前核对项。",
    source: { name: "Mailchimp 文风指南 · 社交媒体", url: "https://styleguide.mailchimp.com/writing-for-social-media/" }
  },
  {
    id: "faq-from-questions",
    category: "文案",
    title: "把真实咨询整理成帮助中心问答",
    description: "合并重复提问，用已知规则回答。",
    body: "问题有【例：周日能还书吗？晚上九点还书箱还开着吗？】，已确认规则为【例：北门还书箱全天开放，归还状态在次一工作日更新】。写一组能独立阅读的 FAQ，先按用户要完成的动作分组，再用回答首句直接解决问题。规则未覆盖的点留给负责人核实。",
    source: { name: "Google Workspace · 客服提示词", url: "https://workspace.google.com/resources/ai/prompts-for-customer-service/" }
  },
  {
    id: "customer-story",
    category: "文案",
    title: "把访谈写成有出处的客户故事",
    description: "用可核对的细节呈现使用前后变化。",
    body: "根据访谈【例：以前交接排班用三个群；现在班表周一集中发出。受访者说“我终于知道该看哪里了”】给【例：小型门店店长】写一段案例。按处境、尝试、观察到的变化组织，只把逐字原话放引号，另外列出要补问的数据和发布前需确认的人名。",
    source: { name: "Google Workspace · 营销提示词", url: "https://workspace.google.com/resources/ai/prompts-for-marketing/" }
  },
  {
    id: "brand-asset-copy",
    category: "文案",
    title: "为同一活动写一套配套物料",
    description: "让海报、视频和报名页讲同一个承诺。",
    body: "活动为【例：周末修补衣物小课堂，自带一件旧衣】，希望【例：吸引没有缝纫经验的邻居】。先定一句能由活动内容兑现的核心承诺，据此写海报标题、10 秒视频口播、报名页说明。为设计师留出必须出现的文字、可缩短的文字和缺失字段。",
    source: { name: "MiniMax Design · 品牌营销制作", url: "https://design.minimax.cn/" }
  },
  {
    id: "catalog-caption",
    category: "文案",
    title: "为商品组图配图注文案",
    description: "让不同图片分别解释尺寸、材质和使用情境。",
    body: "商品信息为【例：搪瓷杯，300 毫升，杯沿为深蓝色】，照片有【例：正面白底、手持对比、杯沿特写】。逐张写主标题、图注和拍摄时要看清的证据。把无法从照片判断的性能单列，不给它编测试结论。",
    source: { name: "MiniMax Design · 电商商品图（工作流参考）", url: "https://design.minimax.cn/#skills" }
  },
  {
    id: "event-reminder",
    category: "文案",
    title: "写一封让报名者能按时参加的提醒",
    description: "突出时间、入口、准备事项和联系途径。",
    body: "根据【例：周四 19:30 在线讲座，提前十分钟进场，需准备纸笔】给【例：已报名的新人】写活动前一天的提醒。依次写主题、开头、加入步骤和遇到问题的处理办法。对材料里没有的会议链接、时区和联系人用“待补”提示编辑。",
    source: { name: "Mailchimp 文风指南 · 邮件通讯", url: "https://styleguide.mailchimp.com/writing-email-newsletters/" }
  },
  {
    id: "infographic-brief",
    category: "文案",
    title: "把长文压成一张信息图的文字稿",
    description: "确定阅读顺序、数字口径和图形选择。",
    body: "主题为【例：社区图书的旅行路线】，材料有【例：捐赠、登记、上架、借出、归还五个环节】。面向【例：初次参观的孩子】写信息图文字稿，给画面标题、每个图块的一句说明和图标建议。把过程顺序与数量比较分开，缺失的数字请留空。",
    source: { name: "prompts.chat · 8 票（2026-11-26）", url: "https://prompts.chat/prompts/cml0rq01u0001jh04xjjqhqci" }
  },
  {
    id: "instruction-card",
    category: "文案",
    title: "把操作说明压成现场提示卡",
    description: "按动作顺序突出关键条件和完成反馈。",
    body: "现场操作是【例：先在自助柜扫描借阅码，再放入书本，等绿灯亮起后关门】，提示卡贴在【例：柜门把手右侧】。写一个可扫读的标题和最多四行的正文，每行一个动作。另写一条遇到红灯时的提示，从材料中找不到的处理方式单列待补。",
    source: { name: "Google 写作指南 · 无障碍文档", url: "https://developers.google.com/style/accessibility" }
  },
  {
    id: "qa-interview-story",
    category: "文案",
    title: "把创作访谈剪成带引语的人物小稿",
    description: "在有限篇幅留下真正说明人物选择的细节。",
    body: "根据【例：问为何留下旧柜台；答“上面有我爸教我记账时划的线”；又提到店搬过两次】写【例：180 字社区人物介绍】。开篇用一个具体物件，中间用一句逐字引语，结尾回到今天的场景。标清材料中没有交代、需要采访补问之处。",
    source: { name: "Google Workspace · 营销提示词", url: "https://workspace.google.com/resources/ai/prompts-for-marketing/" }
  },
  {
    id: "release-announcement",
    category: "文案",
    title: "把改版说明写成用户能看懂的公告",
    description: "按使用影响说明功能、迁移和后续动作。",
    body: "产品改动是【例：导出路径可以自定义，旧文件仍留在原目录，设置入口在偏好设置里】。为【例：已有桌面版用户】写更新公告。开头给出新能力，随后用一个日常例子说清差别，再列升级后该在哪里核对。保留明确的适用版本，未知项请标出。",
    source: { name: "Keep a Changelog · 版本变更记录", url: "https://keepachangelog.com/en/1.1.0/" }
  },
  {
    id: "scope-research",
    category: "研究",
    title: "把决策问题缩成一轮研究",
    description: "从要做的决定倒推人群、观察和交付。",
    body: "团队需要决定【例：是否把读者预约流程从三页合成一页】，有【例：两周、一名访谈员、一个交互原型】。拟一个本轮能回答的问题，界定相关人群和不在范围的环节。列出观察方法、记录方式以及会让团队改变决定的结果。",
    source: { name: "GOV.UK 服务手册 · 规划用户研究", url: "https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service" }
  },
  {
    id: "neutral-interview",
    category: "研究",
    title: "用一次真实经历设计深访提纲",
    description: "用事件追问代替让受访者评价设想。",
    body: "研究对象是【例：曾在网上预约公共运动场地的人】，想弄清【例：为什么有人在选时段时退出】。写一份 25 分钟提纲，先请对方回忆最近一次操作，逐步追问当时看见什么、做了什么、随后发生什么。给每个问题一条可选追问。",
    source: { name: "GOV.UK 服务手册 · 深度访谈", url: "https://www.gov.uk/service-manual/user-research/using-in-depth-interviews" }
  },
  {
    id: "observation-sheet",
    category: "研究",
    title: "为现场观察设计记录表",
    description: "把动作、原话、环境和解释分列。",
    body: "我要在【例：展馆自助寄存柜】观察【例：第一次到访的人取回物品】。请给一张单人可用的记录表，包括起止事件、观察者站位、动作、原话和等待时间。用一条虚构记录说明格式，把观察到的行为和可能原因写在不同栏。",
    source: { name: "GOV.UK 服务手册 · 情境研究与观察", url: "https://www.gov.uk/service-manual/user-research/contextual-research-and-observation" }
  },
  {
    id: "usability-task",
    category: "研究",
    title: "写不会泄露操作路径的可用性任务",
    description: "定义起点和成功信号，保留独立尝试空间。",
    body: "待测功能是【例：更改取书地点】，用户情境为【例：下周出差，想把已预约的书改到公司附近领取】。写主持人开场、三项递进任务和中立追问。每项列可观察的成功标准与提前终止的条件，题干不要透露按钮名称。",
    source: { name: "GOV.UK 服务手册 · 主持可用性测试", url: "https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing" }
  },
  {
    id: "cluster-notes",
    category: "研究",
    title: "把访谈便签归成有证据的主题",
    description: "让每个归纳结论都能找到对应原话和反例。",
    body: "原始便签为【例：P1“我只看短信”；P2 一直刷新网页；P3“想留个纸条提醒”】。围绕【例：用户如何确认预约状态】聚类。保留便签编号，每条发现引用至少一条原始记录。给不合群的记录另设位置，列出一个可能推翻当前解释的后续问题。",
    source: { name: "GOV.UK 服务手册 · 分析研究记录", url: "https://www.gov.uk/service-manual/user-research/analyse-a-research-session" }
  },
  {
    id: "journey-map",
    category: "研究",
    title: "从事件记录画体验旅程",
    description: "寻找跨渠道掉线的环节和候补解释。",
    body: "按【例：看到公告、线上填表、到馆核验、短信收件】四段梳理【例：补办借书证】。资料有【例：到馆后才得知需带照片；收件短信没有回电号码】。做旅程表，每行写目标、触点、观察和未知项。标出哪里有证据说明不便，哪里需要再访谈。",
    source: { name: "GOV.UK 服务手册 · 绘制体验地图", url: "https://www.gov.uk/service-manual/user-research/creating-an-experience-map" }
  },
  {
    id: "survey-repair",
    category: "研究",
    title: "把有诱导性的问卷题改中立",
    description: "一次只问一个概念，并让选项可作答。",
    body: "待审题是【例：你是否满意我们快捷又贴心的新柜台服务？】，对象为【例：过去 30 天到访的人】。指出一题多问、预设倾向、回忆区间和选项遗漏之处。给一版拆分后的题目与选项，解释哪些人应跳过哪题，并设计一句预测试追问。",
    source: { name: "Pew Research Center · 问卷设计", url: "https://www.pewresearch.org/writing-survey-questions/" }
  },
  {
    id: "search-strategy",
    category: "研究",
    title: "把研究概念写成可复查的检索记录",
    description: "记录同义词、字段、限制条件和试搜结果。",
    body: "主题是【例：公共图书馆延时开放与晚间使用行为】，先在【例：OpenAlex 和本校馆藏目录】试搜。将问题拆成概念组，列中英文近义词和可能混入的歧义词。分别给检索草稿、待查语法与日志字段，预留检索日期和命中数给实际检索者填写。",
    source: { name: "PRISMA · 检索报告扩展", url: "https://www.prisma-statement.org/prisma-search" }
  },
  {
    id: "screen-criteria",
    category: "研究",
    title: "为文献筛选写纳排规则",
    description: "先定义证据标准，再用边界案例试跑。",
    body: "拟综述的问题是【例：中学课堂使用纸质或电子笔记与概念回忆成绩的关系】。现有边界案例有【例：只有偏好问卷；大学生随机试验；中学生前后测】。拟对象、情境、结果和材料类型规则，逐个判断并解释。资料不足时给出全文待核对的字段。",
    source: { name: "PRISMA · 综述报告清单", url: "https://www.prisma-statement.org/prisma-2020-checklist" }
  },
  {
    id: "study-flow",
    category: "研究",
    title: "核对筛选流程中的数字",
    description: "逐段对账并找出无法解释的差额。",
    body: "工作记录写着【例：检索出 180 条，去重 32 条，初筛排除 90 条，取得全文 50 篇，最终纳入 17 篇】。为【例：课程综述的筛选流程图】核对每一阶段的单位、去向和差额。区分待获取、全文排除和重复报道，给出需回查的记录而不补造人数或篇数。",
    source: { name: "PRISMA · 筛选流程图", url: "https://www.prisma-statement.org/prisma-2020-flow-diagram" }
  },
  {
    id: "extract-records",
    category: "研究",
    title: "把非结构化材料摘成可核查的数据表",
    description: "保存原文单位、空值和出处。",
    body: "从材料【例：A 馆周六 18–20 时入馆 42 人次；B 馆只记录全天 106 人次】提取【例：地点、时段、指标、数值、单位】。每行附原句或段落号。标记口径不一致的字段，缺失值保留为空，交付前列出哪些行可比较。",
    source: { name: "prompts.chat · 5 票（2026-11-26）", url: "https://prompts.chat/prompts/cmk1g0eby0001jo0459j12ud7" }
  },
  {
    id: "source-reading",
    category: "研究",
    title: "做附原文定位的阅读卡片",
    description: "分清作者主张、支撑材料和你的疑问。",
    body: "读这段材料：【例：试行延长开放的第一个周六共有 42 人次入馆。馆方认为晚间需求旺盛。】供【例：图书馆项目评审】使用。写一张卡，依次列核心判断、原句、能支持到什么程度和一个带着读者回原文的问题，保留原来的统计单位。",
    source: { name: "prompts.chat · 6 票（2026-11-26）", url: "https://prompts.chat/prompts/cmjbgxccq0001ze0rysz0b8le" }
  },
  {
    id: "explain-by-teaching",
    category: "研究",
    title: "用回讲检查我是否真的理解",
    description: "一次问一个问题，用反例纠正理解偏差。",
    body: "我要学【例：相关性和因果性的区别】，手头材料是【例：夏季冷饮销量与游泳人数同时上升】。请先让我用自己的话解释这个例子，等我回答后只指出最重要的一处缺口。接着换一个情境请我重新解释，最后用一个反例检验我能否迁移。",
    source: { name: "r/ChatGPTPromptGenius · 帖子积分快照 +204", url: "https://www.reddit.com/r/ChatGPTPromptGenius/comments/1y0uac8/please_try_my_feynman_technique_prompt_in_projects/" }
  },
  {
    id: "study-roadmap",
    category: "研究",
    title: "按时间和目标做可执行的学习路线",
    description: "把知识依赖转换成练习与自测。",
    body: "我想在【例：四周，每周可用三小时】学会【例：独立做一张含置信区间的调查结果图】，目前会【例：用表格算平均数】。倒推出前置知识，每周安排一种练习和一件可自行检查的作品，标明哪一步失败应回到哪个知识点。",
    source: { name: "r/ChatGPT · 帖子积分快照 +1,571", url: "https://www.reddit.com/r/ChatGPT/comments/1hjqq72/how_to_start_learning_anything_prompt_included/" }
  },
  {
    id: "visual-method",
    category: "研究",
    title: "把科研概念画成可核对的示意图",
    description: "给出对象、关系、比例和图例的含义。",
    body: "我要说明【例：日照改变一天内影子的位置】，读者是【例：小学科学社团】。拟一张三联示意图，逐格列固定参照物、太阳方向、影子端点和文字标注。指出哪些距离仅作示意，列三项能用实际观察核对的画图要求。",
    source: { name: "prompts.chat · 7 票（2026-11-26）", url: "https://prompts.chat/prompts/cmjjd1vfk000bju04vcxhol98" }
  },
  {
    id: "exploratory-data",
    category: "研究",
    title: "分析小表格前先检查分布和异常",
    description: "将可见特征与候选解释分开报告。",
    body: "数据是【例：五个开放日的入馆人次为 52、49、51、120、50，周四举办讲座】，问题是【例：哪一天需要看详细记录】。先列数据类型和是否缺失，再算中位数与范围，为异常值提两种可查证的解释。给一种适合小样本的画法并写出局限。",
    source: { name: "NIST/SEMATECH · 探索性数据分析", url: "https://www.itl.nist.gov/div898/handbook/eda/eda.htm" }
  },
  {
    id: "share-findings",
    category: "研究",
    title: "把研究发现写成面向决策者的一页纸",
    description: "明确哪些决策能做，哪些还需要资料。",
    body: "观察发现【例：五名参与者中三人打开错了取书门，另两人靠现场标识进入】，需要支持【例：是否先试行换一张导向贴】。写标题、证据、限制和下一步。把原始观察、推断和待测的改动分别呈现，用一项现场读数判断试行结果。",
    source: { name: "GOV.UK 服务手册 · 分享研究结果", url: "https://www.gov.uk/service-manual/user-research/sharing-user-research-findings" }
  },
  {
    id: "repo-triage",
    category: "开发",
    title: "把仓库问题分成可验证的修复批次",
    description: "沿用户入口定位证据和回归风险。",
    body: "项目是【例：一个有 CSV 导出功能的待办工具】，用户报告【例：带逗号的标题在表格中裂成两列】。从导出入口追到序列化逻辑，逐项列观察到的现象、证据位置、修复思路和最小回归例。仅将已复现的问题标成已确认，其余列待验证步骤。",
    source: { name: "prompts.chat · 23 票（2026-11-26）", url: "https://prompts.chat/prompts/cmj5w8ysy000qrf0rzwgdwkxj" }
  },
  {
    id: "landing-implementation",
    category: "开发",
    title: "把产品气质落成可实现的网页规格",
    description: "将素材约束转换为布局、状态和断点。",
    body: "给【例：独立旧书店的周末活动页面】写前端实现规格，现有【例：一张门店照片、报名链接、活动表】。确定首屏的信息顺序和主操作，列窄屏堆叠次序、键盘焦点、图片失败时的替代内容。最后给最少组件和三个可手动验收的场景。",
    source: { name: "prompts.chat · 7 票（2026-11-26）", url: "https://prompts.chat/prompts/cmjfsjsnk0001jy04gq5zoxzh" }
  },
  {
    id: "refactor-behavior",
    category: "开发",
    title: "先固定行为再拆开难读的函数",
    description: "逐步重构并验证旧调用者依赖的结果。",
    body: "函数目前【例：根据用户类别和满减门槛计算折扣，平手时优先会员券】，痛点是【例：三层嵌套导致边界难读】。先列必须保留的返回值、优先级和副作用，再给一版可读的重构与逐项行为对照。没有提供源码时，用明确标注的伪代码表达。",
    source: { name: "GitHub Docs · 改善代码可读性", url: "https://docs.github.com/en/copilot/tutorials/copilot-cookbook/refactor-code/improve-code-readability" }
  },
  {
    id: "legacy-walkthrough",
    category: "开发",
    title: "给接手者补一份旧代码导览",
    description: "从实际入口标记数据流和隐含约定。",
    body: "请阅读【例：订单导入任务的启动函数、解析器和仓储接口】，接手者需要【例：给错误行增加行号】。从入口串起调用顺序、数据变形、失败处理和测试位置，每一处写实际符号名。末尾区分源码可证的行为和需要运行后核对的行为。",
    source: { name: "GitHub Docs · 为旧代码补文档", url: "https://docs.github.com/en/copilot/tutorials/copilot-cookbook/document-code/document-legacy-code" }
  },
  {
    id: "repro-report",
    category: "开发",
    title: "把零散反馈写成可复现的问题单",
    description: "区分发生条件、实际结果和仍未知的环境。",
    body: "用户说【例：第二次导出同名文件后界面一直转圈】，环境为【例：Windows 11，离线模式，目录可写】。整理成 issue，给最少复现步骤、期望与实际结果、已知频率和需要的日志。提出一项可以缩小范围的补充实验，保留未知项。",
    source: { name: "GitHub Docs · 问题模板", url: "https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository" }
  },
  {
    id: "adr-choice",
    category: "开发",
    title: "用一页记录架构决定",
    description: "写明约束、备选方案、代价和复议触发点。",
    body: "团队要为【例：本地桌面工具的历史记录】在【例：SQLite 与按日 JSON 文件】中做选择。已知【例：每天约 300 条，需关键字搜索，单机离线】。拟一份 ADR，列背景、待决定事项、两种方案的具体后果和建议。缺少测量的数据留下基准测试办法。",
    source: { name: "ADR · 架构决定记录", url: "https://adr.github.io/" }
  },
  {
    id: "config-contract",
    category: "开发",
    title: "整理程序的配置约定",
    description: "标明来源、优先级、校验和敏感字段行为。",
    body: "应用有【例：用户设置、环境变量、启动参数】三种配置来源，字段包括【例：下载目录、并发数和访问令牌】。请给优先级表、默认值策略与非法值示例，说明哪些设置可热更新，日志如何表达已加载状态。用两个冲突样例验算最终生效值。",
    source: { name: "The Twelve-Factor App · 配置", url: "https://12factor.net/config" }
  },
  {
    id: "query-plan",
    category: "开发",
    title: "把查询计划解释给维护者",
    description: "按证据定位成本与估算偏差。",
    body: "分析 PostgreSQL 查询【例：按客户和日期筛选订单并按时间倒序分页】。计划片段：【例：Seq Scan on orders，估计 30 行，实际 3500 行】。解释关键节点、最值得核实的估算和需补的表统计信息。给一个低风险对比实验和可判定改善的指标。",
    source: { name: "PostgreSQL · 阅读查询计划", url: "https://www.postgresql.org/docs/current/using-explain.html" }
  },
  {
    id: "api-guide",
    category: "开发",
    title: "把接口约定写成第一次调用指南",
    description: "分开成功请求、可纠正错误和参考信息。",
    body: "接口为【例：GET /books，需要 q 参数，返回 items 和 nextCursor】，读者是【例：首次接入的前端同事】。写一段从第一条请求到读到第二页的操作说明，给样例请求、响应字段和分页停止条件。将未知的状态码、限流值列为文档待补项。",
    source: { name: "Diátaxis · 操作指南与参考文档", url: "https://diataxis.fr/" }
  },
  {
    id: "keyboard-flow",
    category: "开发",
    title: "复核表单的键盘与错误反馈",
    description: "按实际操作设计无鼠标验收步骤。",
    body: "为【例：预约日期、时段、提交按钮组成的表单】设计【例：只使用 Tab、Shift+Tab、Enter】的验收。分别走成功、漏填、校验失败后恢复三条路径。每步列焦点位置、控件名称、读屏应获得的信息和可观察的通过条件。",
    source: { name: "W3C WAI · 可访问的表单", url: "https://www.w3.org/WAI/tutorials/forms/" }
  },
  {
    id: "canary-plan",
    category: "开发",
    title: "为改动写逐步发布与回退方案",
    description: "选可观测的人群、指标和停止条件。",
    body: "新版本改了【例：搜索排序与索引缓存】，可以先覆盖【例：5% 的内部用户】，目前能观察【例：查询延迟、失败率、无结果比例】。规划基线、扩量步骤和回退，说明指标要与哪组比较、看多久、谁能决定暂停。未知阈值保留为待测。",
    source: { name: "Google SRE · 金丝雀发布", url: "https://sre.google/workbook/canarying-releases/" }
  },
  {
    id: "incident-timeline",
    category: "开发",
    title: "从日志重建故障时间线",
    description: "明确用户影响、恢复证据和待验证原因。",
    body: "已知记录为【例：09:10 发布；09:14 延迟报警；09:21 回退；09:27 队列恢复】，影响范围是【例：图片导出任务延迟】。写一份复盘草稿，区分日志事件、推测原因和待确认的用户影响。给两个可验证的改进动作，为每个动作定义完成证据。",
    source: { name: "Google SRE · 事后复盘", url: "https://sre.google/workbook/postmortem-culture/" }
  },
  {
    id: "changes-for-release",
    category: "开发",
    title: "把合并记录整理成版本更新清单",
    description: "按用户可感知的变化归类，标出迁移影响。",
    body: "请整理【例：新增离线搜索；调整默认目录；修复空标题导出失败；更新构建工具】为【例：1.3.0】更新清单。区分新增、变更和修复，内部构建改动另列维护说明。对可能影响旧配置的项给迁移提示，缺少版本或操作依据时标为待核对。",
    source: { name: "Keep a Changelog · 版本变更记录", url: "https://keepachangelog.com/en/1.1.0/" }
  },
  {
    id: "commit-split",
    category: "开发",
    title: "把混合改动拆成可审阅的提交",
    description: "用清晰范围区分行为改动和机械重排。",
    body: "改动包括【例：导入器兼容空行、更新回归样例、统一界面按钮缩进】，团队使用【例：Conventional Commits】。建议能单独解释和验证的提交分组，每组写标题、包含的文件类型及对应验证动作。指出必须同批落地的依赖与理由。",
    source: { name: "Conventional Commits · 提交约定", url: "https://www.conventionalcommits.org/en/v1.0.0/" }
  },
  {
    id: "issue-acceptance",
    category: "开发",
    title: "把功能愿望写成验收场景",
    description: "把模糊要求还原为可观察的用户行为。",
    body: "需求为【例：离线也能收藏文章】，现有限制是【例：正文可能未缓存、网络会中断】。为 issue 写用户目标、范围、成功路径和三条边界场景。每个场景用前置状态、操作、可观察结果表达，最后列一项必须向产品确认的取舍。",
    source: { name: "GitHub Docs · 如何描述可执行任务", url: "https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results" }
  },
  {
    id: "readable-tables",
    category: "开发",
    title: "给数据表格补足可访问结构",
    description: "从读屏的行列关系检查表头与标题。",
    body: "表格展示【例：不同分馆按月份统计的到馆和借阅数】，有【例：分组表头、总计行和按列排序】。请写一个精简 HTML 例子，说明标题、行列标题和排序状态如何传达。用一个具体数据格演示读者会得到的上下文，并列出小屏验收要点。",
    source: { name: "W3C WAI · 可访问的表格", url: "https://www.w3.org/WAI/tutorials/tables/" }
  },
  {
    id: "configurable-theme",
    category: "开发",
    title: "把品牌视觉拆成可切换的主题",
    description: "清楚区分品牌值、组件状态和布局。",
    body: "同一套【例：活动报名页面】要服务【例：明亮的科普节和深色的夜间电影节】。设计一张主题变量表和两个组件示例，覆盖文字、背景、焦点环与禁用态。给出不改组件结构即可换主题的接入办法，并列需要人工验证的对比度组合。",
    source: { name: "prompts.chat · 6 票（2026-11-26）", url: "https://prompts.chat/prompts/cmj8q3fso0001wb0q7zs7k8dg" }
  },
  {
    id: "time-budget",
    category: "办公",
    title: "把拥挤的一天排成可执行的日程",
    description: "按紧迫性、影响和可用时间取舍。",
    body: "我的任务有【例：中午前交发票、下午审一份合同、整理旧笔记、给同事同步进度】，固定占用为【例：10:00–11:00 和 14:00–15:00 开会】。先问清一个影响排序的约束，然后给按时段的计划、可以委派的事项和必须推迟的一项，留出中断缓冲。",
    source: { name: "r/ChatGPTPromptGenius · 帖子积分快照 +221", url: "https://www.reddit.com/r/ChatGPTPromptGenius/comments/1orl7xk/5_chatgpt_prompts_i_stole_from_productivity/" }
  },
  {
    id: "project-poster",
    category: "办公",
    title: "用一页对齐项目目标",
    description: "把问题、成功依据和边界写进立项简报。",
    body: "准备启动【例：把园区报修从电话改为在线提交】，目前知道【例：报修人经常不知道处理到哪一步】。给项目团队做一页简报，包括问题、受影响人群、成功信号、范围和待检验假设。把“上线表单”换成至少一个用户能感知的结果。",
    source: { name: "Atlassian Team Playbook · 项目简报", url: "https://www.atlassian.com/team-playbook/plays/project-poster" }
  },
  {
    id: "roles-map",
    category: "办公",
    title: "厘清跨团队交接责任",
    description: "为每项交付标出承担、确认和协作角色。",
    body: "项目有【例：运营、前端、内容编辑三个小组】，工作包括【例：起草公告、核对链接、上线和处理读者反馈】。做责任表，逐项注明执行人、最终确认人和交接证据。对多人都认为自己负责或无人认领的环节写出需要开会决定的问题。",
    source: { name: "Atlassian Team Playbook · 角色与职责", url: "https://www.atlassian.com/team-playbook/plays/roles-and-responsibilities" }
  },
  {
    id: "premortem-plan",
    category: "办公",
    title: "在开工前演练一次失败",
    description: "把想象中的失败转成现在可观察的信号。",
    body: "假设【例：下月的线上工作坊】结束后效果很差。已知【例：报名来自三个渠道，只有一位现场主持】。从参与者、流程和技术三个角度写出具体失败情景，分别列最早信号、预防动作、触发后怎么办，以及谁最适合确认。最先处理哪两项？",
    source: { name: "Atlassian Team Playbook · 预演失败", url: "https://www.atlassian.com/team-playbook/plays/pre-mortem" }
  },
  {
    id: "retro-experiment",
    category: "办公",
    title: "把复盘变成下一轮的小实验",
    description: "从真实事件中选一个团队可控制的改变。",
    body: "本轮经历【例：两次等待译稿导致延期，一次提前共享术语表减少了返工】。给【例：三人编辑组】写 30 分钟回顾会流程。用不归责的提问收集事件，对重复现象提出一个两周可试的小改变，写明观察方法和下次复盘时的停止条件。",
    source: { name: "Atlassian Team Playbook · 团队回顾", url: "https://www.atlassian.com/team-playbook/plays/retrospective" }
  },
  {
    id: "handoff-note",
    category: "办公",
    title: "为临时接班人写交接单",
    description: "列出当前状态、文件和遇事决策路径。",
    body: "下周由【例：运营同事小陈】代管【例：周三直播，讲者已确认，回放尚未审批】。整理成一页交接单，列所需文件、下一个动作、最迟处理时刻和升级联系人。把只有我知道但材料尚未交代的信息列成离岗前问题，并区分已完成和待办。",
    source: { name: "Google Workspace · 项目管理提示词", url: "https://workspace.google.com/resources/ai/prompts-for-project-management/" }
  },
  {
    id: "agenda-timebox",
    category: "办公",
    title: "让会议围绕一个待决事项展开",
    description: "用输入、分配时长和输出约束议程。",
    body: "需要【例：40 分钟内确认工作坊场地】，参会者有【例：活动组织者、财务和场地管理员】。按分钟拟会前材料、议程、主持提问和决策记录格式，给分歧预留时间。每项注明结束时桌上应有何种结果，核对时间总和。",
    source: { name: "Google Workspace · 项目管理提示词", url: "https://workspace.google.com/resources/ai/prompts-for-project-management/" }
  },
  {
    id: "change-impact",
    category: "办公",
    title: "评估一次临时变更的连带影响",
    description: "把受影响的任务、通信对象和待批准项列清。",
    body: "原计划【例：周三上午发布培训录像】，新要求【例：改到周一并增加双语字幕】。根据现有资源【例：一名剪辑、一名翻译】列出变化影响、依赖任务和必须先问的问题。写两种可选调整及后果，再附一段发给负责人的确认文字。",
    source: { name: "Google Workspace · 项目管理提示词", url: "https://workspace.google.com/resources/ai/prompts-for-project-management/" }
  },
  {
    id: "prioritize-ideas",
    category: "办公",
    title: "给提案会准备可比较的候选方案",
    description: "先发散再用现实约束筛选。",
    body: "目标是【例：让新员工在第一周认识不同团队的人】，可用【例：一间会议室、两小时、零外部预算】。提出五种机制不同的活动，逐一说明参与门槛、组织成本和试行反馈办法。按约束选出两项并说明放弃其余方案的理由。",
    source: { name: "prompts.chat · 8 票（2026-11-26）", url: "https://prompts.chat/prompts/cmmkqhi6v6d9gegqgt9a4" }
  },
  {
    id: "budget-reconcile",
    category: "办公",
    title: "对账时指出差额来自哪一行",
    description: "还原预算、实际与未支付项目。",
    body: "预算记录为【例：场地 1200 元、物料 800 元】，实际为【例：场地 1200 元已付、物料 640 元已付、物料 90 元待付】。请给逐项对账表，分别算已付现金、已发生费用和预算余量。提醒我核对重复发票和未列税费，无法匹配的条目保留原名。",
    source: { name: "MiniMax Agent · minimax-xlsx", url: "https://agent.minimax.io/skills" }
  },
  {
    id: "spreadsheet-cleaning",
    category: "办公",
    title: "给混乱的报名表定清洗规则",
    description: "保留原始值并追踪合并依据。",
    body: "表里有【例：姓名“李 琳”和“李琳”，空白部门，不同格式的报名日期】，要用于【例：按部门统计实到人数】。请列字段清洗规则、保留原始列的方法和可人工复核的冲突表。给两行前后对照样例，说明在什么证据下才允许合并人员。",
    source: { name: "MiniMax Agent · minimax-xlsx", url: "https://agent.minimax.io/skills" }
  },
  {
    id: "exec-slide-outline",
    category: "办公",
    title: "为决策人排一份汇报幻灯片",
    description: "让每页回答一个会影响选择的问题。",
    body: "听众是【例：决定是否扩展试点的部门主任】，材料为【例：两周内 18 人报名，12 人完成；访谈反映场地太远】。写【例：五页】汇报大纲，每页用一句结论做标题，给支撑证据、图形建议和口头过渡。最后一页写清请求的决定及未知成本。",
    source: { name: "MiniMax Agent · html-presentation-generator", url: "https://agent.minimax.io/skills" }
  },
  {
    id: "support-triage",
    category: "办公",
    title: "把一批客户留言整理成处理队列",
    description: "按影响和可执行动作归并重复请求。",
    body: "留言有【例：两人说收不到确认信，一人要改发票抬头，另一人建议增加夜场】，处理小组有【例：客服、财务、产品】。做一张工单分流表，每项列原句索引、影响、优先级理由和应补问的信息。只凭这些留言能确认的事实写进首轮回复。",
    source: { name: "Google Workspace · 客服提示词", url: "https://workspace.google.com/resources/ai/prompts-for-customer-service/" }
  },
  {
    id: "step-by-step-sop",
    category: "办公",
    title: "把熟练同事的口述改成接手人能做的 SOP",
    description: "为每一步补齐输入、结果和失败分支。",
    body: "师傅口述为【例：先检查设备标签，去表里记编号，领走时让对方签字】，场景是【例：办公室临时借用投影仪】。写成 SOP，列准备物、编号步骤和归还时需要核对的记录。对标签丢失、同编号等情况提出待确认的处理分支。",
    source: { name: "Diátaxis · 操作指南与参考文档", url: "https://diataxis.fr/" }
  },
  {
    id: "approval-summary",
    category: "办公",
    title: "把长邮件串收束成一个审批摘要",
    description: "保留争议、最新决定和仍需确认的金额。",
    body: "邮件摘要为【例：甲提议加租投影；乙报价 400 元；甲后又说明原套餐含投影但需转接头】，现在要请【例：活动负责人】批准。按时间还原事实变化，在首段写清当前要批什么，列报价出处和不再适用的早期提议，末尾给可直接回复的选项。",
    source: { name: "Google Workspace · 商务提示词指南", url: "https://workspace.google.com/resources/ai/writing-effective-prompts/" }
  },
  {
    id: "new-hire-learning",
    category: "办公",
    title: "为新人安排能检查结果的入职学习",
    description: "按先后关系安排真实的小任务。",
    body: "岗位为【例：展厅值班助理】，首周要学【例：开馆检查、讲解耳机借还和异常上报】。新人已有【例：门店服务经验】。请做五天计划，每天一项旁观任务、一项独立尝试和一个确认掌握的标准。涉及权限或必须有人陪同的操作单列。",
    source: { name: "r/ChatGPT · 帖子积分快照 +1,571", url: "https://www.reddit.com/r/ChatGPT/comments/1hjqq72/how_to_start_learning_anything_prompt_included/" }
  },
  {
    id: "data-summary-chart",
    category: "办公",
    title: "为例会选一张有解释力的数据图",
    description: "让标题、比较基线和数据口径一致。",
    body: "数据为【例：三场工作坊报名 30、28、40 人，到场 24、14、32 人】，会议想回答【例：哪一场最值得回顾到场提醒流程】。先算比率、给一张图的类型与轴标签，写一句可以由数据支持的图标题。区分人数和比例，说明还需哪项证据才能解释原因。",
    source: { name: "prompts.chat · 8 票（2026-11-26）", url: "https://prompts.chat/prompts/cml0rq01u0001jh04xjjqhqci" }
  }
];
