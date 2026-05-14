---
name: openspec-apply-change
description: "实现 OpenSpec change 中的任务。适用于用户想开始实现、继续实现，或逐项完成 tasks 的场景。"
license: MIT
compatibility: "需要 openspec CLI。"
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.0"
---

实现 OpenSpec change 中的任务。

**输入**：可选择指定 change 名称。如果省略，先判断能否从对话上下文推断出来。如果含糊或存在歧义，你必须提示用户从可用 changes 中选择。

**步骤**

1. **选择 change**

   如果提供了名称，就使用该名称。否则：
   - 如果用户在对话中提到了某个 change，则从上下文推断
   - 如果只有一个 active change，则自动选择
   - 如果存在歧义，运行 `openspec list --json` 获取可用 changes，并使用 **AskUserQuestion 工具**让用户选择

   始终声明：“使用 change：<name>”，并说明如何覆盖选择（例如 `/opsx:apply <other>`）。

2. **检查状态以理解 schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流（例如 `"spec-driven"`）
   - 哪个 artifact 包含任务（spec-driven 通常是 `tasks`，其他 schema 以 status 为准）

3. **获取 apply 指令**

   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   返回内容包括：
   - 上下文文件路径（随 schema 而异，可能是 proposal/specs/design/tasks，也可能是 spec/tests/implementation/docs）
   - 进度（总数、已完成、剩余）
   - 带状态的任务列表
   - 基于当前状态的动态指令

   **处理状态：**
   - 如果 `state: "blocked"`（缺少 artifacts）：展示消息，并建议使用 openspec-continue-change
   - 如果 `state: "all_done"`：表示祝贺，并建议 archive
   - 否则：继续实施

4. **读取上下文文件**

   读取 apply 指令输出中 `contextFiles` 列出的文件。
   文件取决于正在使用的 schema：
   - **spec-driven**：proposal、specs、design、tasks
   - 其他 schema：遵循 CLI 输出中的 contextFiles

5. **展示当前进度**

   展示：
   - 正在使用的 schema
   - 进度：“N/M 个任务已完成”
   - 剩余任务概览
   - CLI 返回的动态指令

6. **实现任务（循环直到完成或被阻塞）**

   对每个待处理任务：
   - 展示正在处理的任务
   - 做出所需代码修改
   - 保持变更最小且聚焦
   - 在 tasks 文件中标记任务完成：`- [ ]` → `- [x]`
   - 继续下一个任务

   **在以下情况暂停：**
   - 任务不清楚 → 请求澄清
   - 实现过程中发现设计问题 → 建议更新 artifacts
   - 遇到错误或阻塞 → 报告并等待指导
   - 用户打断

7. **完成或暂停时展示状态**

   展示：
   - 本轮会话完成的任务
   - 总体进度：“N/M 个任务已完成”
   - 如果全部完成：建议 archive
   - 如果暂停：说明原因并等待指导

**实现过程中的输出**

```
## 正在实现：<change-name>（schema：<schema-name>）

正在处理任务 3/7：<任务描述>
[...正在实现...]
✓ 任务完成

正在处理任务 4/7：<任务描述>
[...正在实现...]
✓ 任务完成
```

**完成时输出**

```
## 实现完成

**Change：** <change-name>
**Schema：** <schema-name>
**进度：** 7/7 个任务已完成 ✓

### 本轮会话已完成
- [x] 任务 1
- [x] 任务 2
...

所有任务都已完成！可以归档此 change。
```

**暂停时输出（遇到问题）**

```
## 实现已暂停

**Change：** <change-name>
**Schema：** <schema-name>
**进度：** 4/7 个任务已完成

### 遇到的问题
<问题描述>

**选项：**
1. <选项 1>
2. <选项 2>
3. 其他方式

你想怎么处理？
```

**护栏**
- 持续推进任务，直到全部完成或被阻塞
- 开始前始终读取上下文文件（来自 apply 指令输出）
- 如果任务有歧义，先暂停并询问，再实现
- 如果实现暴露问题，暂停并建议更新 artifact
- 代码变更保持最小，并限制在每个任务范围内
- 每完成一个任务，立即更新任务复选框
- 遇到错误、阻塞或不明确需求时暂停，不要猜测
- 使用 CLI 输出中的 contextFiles，不要假设具体文件名

**流式工作流集成**

此 skill 支持“对 change 执行动作”的模型：

- **可随时调用**：所有 artifacts 尚未完成时（只要 tasks 存在）、部分实现之后，或与其他动作交错进行时
- **允许更新 artifacts**：如果实现暴露设计问题，建议更新 artifacts；不要被阶段锁死，保持流式推进
