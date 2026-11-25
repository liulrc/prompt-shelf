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
  }
];
