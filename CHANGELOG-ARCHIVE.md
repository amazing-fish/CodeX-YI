# CHANGELOG-ARCHIVE.md

超出 `ANCHOR.md`“最近14个版本变更日志”的历史条目归档于此；对应审计记录仍保留在 `ANCHOR.md`。

- v1.5.3（bugfix）：八卦 schema 固定每个卦名的 canonical 三位二进制映射，拒绝交换编码但仍格式唯一的语义畸形快照
- v1.5.2（bugfix）：legacy sessionStorage 迁移写入 localStorage 失败时仍返回已解析旧值，并保留原数据供后续重试
- v1.5.1（bugfix）：八卦 schema 强制要求 `乾/坤/震/巽/坎/离/艮/兑` 固定键，防止形式有效但业务查询不可达的数据进入 ready
- v1.5.0（security/bugfix）：历史记录采用 versioned codec 与 canonical `hexagramId` 水合；清理非法/未知版本记录，安全渲染持久化字段，并分离 Modal 展示内容与可保存卦象
- v1.4.0（bugfix）：为 64/8 数据快照建立严格 schema、两阶段关系索引和原子 ready 提交；空、缺失、畸形 JSON/JS fallback 均失败关闭
- v1.3.1（bugfix）：保留首次打开 Modal 的外部焦点来源，避免相关卦象内导航覆盖 opener；补充焦点恢复行为回归测试
- v1.3.0（bugfix）：补齐本地 favicon 与系统字体回退；修复搜索卦序/分类/特殊字符、推荐区 DOM 所有权、分析器就绪渲染、投掷重置竞态、重复错误监听和模态框焦点循环
- v1.2.0（docs）：补充 MIT 许可证与零依赖项目校验；记录问题分类、分层 PR、测试与安全边界设计；为后续 GitHub Issue 和修复提交建立可审计基线
- v1.1.0（arch/docs）：完整梳理架构与技术路径；填充“项目地图”与“关键逻辑链路”；新增 v1.1.0 审计记录与手动验证建议；保持静态架构与 GitHub Pages 部署路径不变
- v1.0.0（feature）：新增协作文档 `AGENTS.md` 与锚点文档 `ANCHOR.md`；确立角色、流程、提示词与审计规范；落实 Windows + PowerShell 约定
