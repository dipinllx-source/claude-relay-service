---
name: openspec-propose
description: "一步生成新 change 的完整 artifacts。适用于用户想快速描述要构建的内容，并获得可用于实现的 proposal、design、specs 和 tasks 的场景。"
license: MIT
compatibility: "需要 openspec CLI。"
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.0"
---

提出一个新 change：创建 change，并一步生成所有 artifacts。

我会创建包含以下 artifacts 的 change：
- `proposal.md`（做什么以及为什么）
- `design.md`（如何实现）
- `tasks.md`（实现步骤）

准备实现时，运行 `/opsx:apply`。

---

**输入**：用户请求应包含一个 change 名称（kebab-case），或描述他们想构建的内容。

**步骤**

1. **如果未提供清晰输入，询问用户想构建什么**

   使用 **AskUserQuestion 工具**（开放式问题，无预设选项）询问：
   > “你想处理什么 change？请描述你想构建或修复的内容。”

   根据用户描述推导一个 kebab-case 名称（例如 “add user authentication” → `add-user-auth`）。

   **重要**：在理解用户想构建什么之前，不要继续。

2. **创建 change 目录**
   ```bash
   openspec new change "<name>"
   ```
   这会在 `openspec/changes/<name>/` 创建带 `.openspec.yaml` 的 change 脚手架。

3. **获取 artifact 构建顺序**
   ```bash
   openspec status --change "<name>" --json
   ```
   解析 JSON 以获取：
   - `applyRequires`：实现前需要的 artifact ID 数组（例如 `["tasks"]`）
   - `artifacts`：所有 artifacts 的列表，以及它们的状态和依赖

4. **按顺序创建 artifacts，直到可 apply**

   使用 **TodoWrite 工具**跟踪 artifacts 的推进进度。

   按依赖顺序循环 artifacts（先处理没有待完成依赖的 artifacts）：

   a. **对于每个 `ready`（依赖已满足）的 artifact：**
      - 获取指令：
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - instructions JSON 包含：
        - `context`：项目背景（给你的约束，不要写入输出）
        - `rules`：artifact 特定规则（给你的约束，不要写入输出）
        - `template`：输出文件应使用的结构
        - `instruction`：该 artifact 类型的 schema 特定指导
        - `outputPath`：artifact 写入位置
        - `dependencies`：需要读取作为上下文的已完成 artifacts
      - 读取任何已完成的依赖文件作为上下文
      - 使用 `template` 作为结构创建 artifact 文件
      - 将 `context` 和 `rules` 作为约束应用，但不要复制到文件中
      - 简短展示进度：`已创建 <artifact-id>`

   b. **继续直到所有 `applyRequires` artifacts 完成**
      - 每创建一个 artifact 后，重新运行 `openspec status --change "<name>" --json`
      - 检查 `applyRequires` 中的每个 artifact ID 是否都在 artifacts 数组中处于 `status: "done"`
      - 当所有 `applyRequires` artifacts 都完成时停止

   c. **如果某个 artifact 需要用户输入**（上下文不明确）：
      - 使用 **AskUserQuestion 工具**澄清
      - 然后继续创建

5. **展示最终状态**
   ```bash
   openspec status --change "<name>"
   ```

**输出**

完成所有 artifacts 后，总结：
- Change 名称和位置
- 已创建 artifacts 列表及其简短说明
- 就绪状态：“所有 artifacts 已创建！可以开始实现。”
- 提示：“运行 `/opsx:apply`，或直接让我实现以开始处理任务。”

**Artifact 创建准则**

- 遵循每种 artifact 类型的 `openspec instructions` 返回的 `instruction` 字段
- schema 定义了每个 artifact 应包含什么；遵循它
- 创建新 artifact 前，先读取依赖 artifacts 作为上下文
- 使用 `template` 作为输出文件结构，并填充各部分
- **重要**：`context` 和 `rules` 是给你的约束，不是文件内容
  - 不要将 `<context>`、`<rules>`、`<project_context>` 块复制到 artifact 中
  - 它们用于指导你写作，但绝不应出现在输出文件中

**护栏**
- 创建实现所需的全部 artifacts（由 schema 的 `apply.requires` 定义）
- 创建新 artifact 前，始终读取依赖 artifacts
- 如果上下文严重不清楚，询问用户；但优先做出合理决策以保持推进
- 如果已存在同名 change，询问用户是继续它还是创建新的 change
- 继续下一个 artifact 前，验证每个 artifact 文件确实存在
