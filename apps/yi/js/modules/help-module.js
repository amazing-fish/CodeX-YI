/**
 * 帮助模块 - 管理帮助和引导
 */
const HelpModule = (function() {
    // 私有变量
    const helpButton = document.getElementById('helpButton');

    // 帮助内容
    const helpContent = {
        title: '易之使用指南',
        sections: [
            {
                title: '基本操作',
                icon: '🎯',
                items: [
                    '点击"投掷铜钱"按钮，依次形成六爻',
                    '完成六爻后，可以点击"变卦显示"查看变卦',
                    '点击"重新起卦"可以清空当前卦象，重新开始',
                    '点击"保存结果"将当前卦象保存到历史记录中',
                    '使用"导出结果"功能可以将占卜结果保存为文件'
                ]
            },
            {
                title: '卦象解读',
                icon: '📖',
                items: [
                    '卦象形成后，可以查看详细解读',
                    '爻辞解读标签页显示各爻的含义',
                    '变爻特别重要，解读时需重点关注',
                    '相关卦象可以帮助理解当前卦象的关联意义',
                    '点击卦象符号可以查看更详细的信息'
                ]
            },
            {
                title: '其他功能',
                icon: '⚙️',
                items: [
                    '历史记录中可以查看过去的占卜结果',
                    '卦象分析工具可以模拟不同八卦的组合',
                    '八卦知识页面提供易经基础理论',
                    '卦象查询功能可以直接搜索特定卦象',
                    '支持键盘快捷键：Alt+数字切换功能区，Ctrl+K快速搜索'
                ]
            },
            {
                title: '占卜原理',
                icon: '🔮',
                items: [
                    '使用三枚铜钱投掷，正面为阳(3)，反面为阴(2)',
                    '三枚铜钱的组合决定每一爻：6为老阴(变阳)，7为少阳，8为少阴，9为老阳(变阴)',
                    '老阴和老阳为变爻，代表能量转化',
                    '本卦显示当前状态，变卦指示发展趋势',
                    '解卦时要综合考虑卦象、爻辞和变化'
                ]
            }
        ]
    };

    // 初始化
    function init() {
        try {
            bindEvents();
        } catch (error) {
            YizhiApp.errors.handle(error, 'Help Module Init');
        }
    }

    // 绑定事件
    function bindEvents() {
        helpButton?.addEventListener('click', showHelp);
        helpButton?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showHelp();
            }
        });
    }

    // 显示帮助
    function showHelp() {
        try {
            // 创建帮助内容HTML
            let sectionsHTML = '';

            helpContent.sections.forEach(section => {
                let itemsHTML = '';
                section.items.forEach(item => {
                    itemsHTML += `<li class="help-item">${item}</li>`;
                });

                sectionsHTML += `
                    <div class="help-section">
                        <h4 class="help-section-title">
                            <span class="help-section-icon">${section.icon}</span>
                            ${section.title}
                        </h4>
                        <ul class="help-item-list">${itemsHTML}</ul>
                    </div>
                `;
            });

            // 添加快捷键信息
            const shortcutsHTML = `
                <div class="help-section">
                    <h4 class="help-section-title">
                        <span class="help-section-icon">⌨️</span>
                        键盘快捷键
                    </h4>
                    <div class="shortcuts-grid">
                        <div class="shortcut-item">
                            <kbd>Alt + 1-5</kbd>
                            <span>切换功能区</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>Ctrl + K</kbd>
                            <span>快速搜索</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>Esc</kbd>
                            <span>关闭弹窗</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>Ctrl + S</kbd>
                            <span>保存当前</span>
                        </div>
                    </div>
                </div>
            `;

            // 创建完整的帮助内容
            const fullContent = `
                <div class="help-content">
                    <div class="help-intro">
                        <h3 class="help-title">${helpContent.title}</h3>
                        <p class="help-description">
                            易之是一个现代化的易经演算系统，融合传统智慧与现代技术，
                            为您提供准确、便捷的占卜体验。以下是详细的使用指南。
                        </p>
                    </div>

                    <div class="help-sections">
                        ${sectionsHTML}
                        ${shortcutsHTML}
                    </div>

                    <div class="help-footer">
                        <p class="help-version">版本：${YizhiApp.config.version}</p>
                        <p class="help-contact">
                            如有问题或建议，欢迎联系我们。
                        </p>
                    </div>
                </div>
            `;

            // 使用模态框显示帮助内容
            const modalContent = {
                name: '使用指南',
                unicode: '?',
                explanation: '易之 V6.2 使用帮助',
                overview: '',
                detail: fullContent
            };

            YizhiApp.getModule('modal')?.show(modalContent);

        } catch (error) {
            YizhiApp.errors.handle(error, 'Show Help');
        }
    }

    // 显示快速提示
    function showQuickTip(message, duration = 3000) {
        try {
            YizhiApp.getModule('notification')?.show('info', '使用提示', message, duration);
        } catch (error) {
            YizhiApp.errors.handle(error, 'Show Quick Tip');
        }
    }

    // 显示功能介绍
    function showFeatureIntro(feature) {
        try {
            const introMessages = {
                divination: '在这里可以进行传统的三钱占卜，通过投掷铜钱形成卦象，获得人生指导。',
                analyzer: '卦象分析工具让您可以自由组合八卦，探索不同卦象的含义和关系。',
                history: '历史记录保存您的所有占卜结果，方便回顾和分析人生轨迹。',
                knowledge: '八卦知识库提供丰富的易经理论知识，帮助您更好地理解卦象。',
                search: '卦象查询功能让您可以快速搜索特定卦象，获取详细信息。'
            };

            const message = introMessages[feature] || '这是一个强大的功能模块。';
            showQuickTip(message, 5000);
        } catch (error) {
            YizhiApp.errors.handle(error, 'Show Feature Intro');
        }
    }

    return {
        init,
        showHelp,
        showQuickTip,
        showFeatureIntro
    };
})();
