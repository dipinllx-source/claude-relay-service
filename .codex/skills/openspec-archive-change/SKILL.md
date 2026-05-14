---
name: openspec-archive-change
description: "归档 experimental workflow 中已完成的 change。适用于用户想在实现完成后 finalize 并 archive change 的场景。"
license: MIT
compatibility: "需要 openspec CLI。"
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.0"
---

归档 experimental workflow 中已完成的 change。

**输入**：可选择指定 change 名称。如果省略，先判断能否从对话上下文推断出来。如果含糊或存在歧义，你必须提示用户从可用 changes 中选择。

**步骤**

1. **如果未提供 change 名称，提示用户选择**

   运行 `openspec list --json` 获取可用 changes。使用 **AskUserQuestion 工具**让用户选择。

   只展示 active changes（不要展示已归档的）。
   如果可用，包含每个 change 使用的 schema。

   **重要**：不要猜测或自动选择 change。始终让用户选择。

2. **检查 artifact 完成状态**

   运行 `openspec status --change "<name>" --json` 检查 artifact 完成情况。

   解析 JSON 以了解：
   - `schemaName`：正在使用的工作流
   - `artifacts`：artifact 列表及其状态（`done` 或其他）

   **如果存在未 `done` 的 artifacts：**
   - 展示警告并列出未完成 artifacts
   - 使用 **AskUserQuestion 工具**确认用户是否仍要继续
   - 如果用户确认，则继续

3. **检查任务完成状态**

   读取 tasks 文件（通常是 `tasks.md`），检查是否有未完成任务。

   统计标记为 `- [ ]`（未完成）与 `- [x]`（已完成）的任务数量。

   **如果发现未完成任务：**
   - 展示警告，说明未完成任务数量
   - 使用 **AskUserQuestion 工具**确认用户是否仍要继续
   - 如果用户确认，则继续

   **如果不存在 tasks 文件：**继续，不展示任务相关警告。

4. **评估 delta spec 同步状态**

   检查 `openspec/changes/<name>/specs/` 下是否存在 delta specs。如果不存在，则无需同步提示，直接继续。

   **如果存在 delta specs：**
   - 将每个 delta spec 与对应的 main spec（`openspec/specs/<capability>/spec.md`）比较
   - 判断会应用哪些变更（新增、修改、移除、重命名）
   - 在提示用户前展示合并摘要

   **提示选项：**
   - 如果需要变更：`立即同步（推荐）`、`不进行同步直接归档`
   - 如果已经同步：`立即归档`、`仍然同步`、`取消`

   如果用户选择同步，使用 Task 工具（subagent_type: `"general-purpose"`，prompt: `"Use Skill tool to invoke openspec-sync-specs for change '<name>'. Delta spec analysis: <include the analyzed delta spec summary>"`）。无论选择如何，随后继续归档。

5. **执行归档**

   如果归档目录不存在，则创建：
   ```bash
   mkdir -p openspec/changes/archive
   ```

   使用当前日期生成目标名称：`YYYY-MM-DD-<change-name>`

   **检查目标是否已存在：**
   - 如果存在：报错失败，建议重命名现有归档或使用不同日期
   - 如果不存在：将 change 目录移动到 archive

   ```bash
   mv openspec/changes/<name> openspec/changes/archive/YYYY-MM-DD-<name>
   ```

6. **展示摘要**

   展示归档完成摘要，包括：
   - Change 名称
   - 使用的 schema
   - 归档位置
   - specs 是否已同步（如适用）
   - 关于任何警告的说明（未完成 artifacts/tasks）

**成功时输出**

```
## 归档完成

**Change：** <change-name>
**Schema：** <schema-name>
**归档至：** openspec/changes/archive/YYYY-MM-DD-<name>/
**Specs：** ✓ 已同步到 main specs（或“无 delta specs”或“已跳过同步”）

所有 artifacts 已完成。所有任务已完成。
```

**护栏**
- 如果未提供 change，始终提示用户选择
- 使用 artifact graph（`openspec status --json`）检查完成状态
- 不要因为警告阻止归档；只需告知并确认
- 移动到 archive 时保留 `.openspec.yaml`（它会随目录一起移动）
- 清晰展示发生了什么
- 如果请求同步，使用 openspec-sync-specs 方式（agent-driven）
- 如果存在 delta specs，始终先运行同步评估并展示合并摘要，再提示用户
