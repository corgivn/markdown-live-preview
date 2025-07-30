import DOMPurify from 'dompurify';
import 'github-markdown-css/github-markdown-light.css';
import * as monaco from 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/+esm';
import { marked } from 'marked';
import Storehouse from 'storehouse-js';

const init = () => {
    let hasEdited = false;
    let scrollBarSync = false;
    let currentHistoryId = null;

    const localStorageNamespace = 'com.markdownlivepreview';
    const localStorageKey = 'last_state';
    const localStorageScrollBarKey = 'scroll_bar_settings';
    const localStorageHistoryKey = 'history_files';
    const confirmationMessage = 'Are you sure you want to reset? Your changes will be lost.';
    // default template
    const defaultInput = `# Markdown syntax guide

## Headers

# This is a Heading h1
## This is a Heading h2
###### This is a Heading h6

## Emphasis

*This text will be italic*  
_This will also be italic_

**This text will be bold**  
__This will also be bold__

_You **can** combine them_

## Lists

### Unordered

* Item 1
* Item 2
* Item 2a
* Item 2b
    * Item 3a
    * Item 3b

### Ordered

1. Item 1
2. Item 2
3. Item 3
    1. Item 3a
    2. Item 3b

## Images

![This is an alt text.](/image/sample.webp "This is a sample image.")

## Links

You may be using [Markdown Live Preview](https://markdownlivepreview.com/).

## Blockquotes

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

## Tables

| Left columns  | Right columns |
| ------------- |:-------------:|
| left foo      | right foo     |
| left bar      | right bar     |
| left baz      | right baz     |

## Blocks of code

${"`"}${"`"}${"`"}
let message = 'Hello world';
alert(message);
${"`"}${"`"}${"`"}

## Inline code

This web site is using ${"`"}markedjs/marked${"`"}.
`;

    self.MonacoEnvironment = {
        getWorker(_, label) {
            return new Proxy({}, { get: () => () => { } });
        }
    }

    let setupEditor = () => {
        let editor = monaco.editor.create(document.querySelector('#editor'), {
            fontSize: 14,
            language: 'markdown',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            scrollbar: {
                vertical: 'visible',
                horizontal: 'visible'
            },
            wordWrap: 'on',
            hover: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            folding: false
        });

        editor.onDidChangeModelContent(() => {
            let changed = editor.getValue() != defaultInput;
            if (changed) {
                hasEdited = true;
            }
            let value = editor.getValue();
            convert(value);
            saveLastContent(value);
            // Auto-save to current history item if exists
            if (currentHistoryId) {
                updateHistoryItem(currentHistoryId, value);
            }
        });

        editor.onDidScrollChange((e) => {
            if (!scrollBarSync) {
                return;
            }

            const scrollTop = e.scrollTop;
            const scrollHeight = e.scrollHeight;
            const height = editor.getLayoutInfo().height;

            const maxScrollTop = scrollHeight - height;
            const scrollRatio = scrollTop / maxScrollTop;

            let previewElement = document.querySelector('#preview');
            let targetY = (previewElement.scrollHeight - previewElement.clientHeight) * scrollRatio;
            previewElement.scrollTo(0, targetY);
        });

        return editor;
    };

    // Render markdown text as html
    let convert = (markdown) => {
        let options = {
            headerIds: false,
            mangle: false
        };
        let html = marked.parse(markdown, options);
        let sanitized = DOMPurify.sanitize(html);
        document.querySelector('#output').innerHTML = sanitized;
    };

    // Reset input text
    let reset = () => {
        let changed = editor.getValue() != defaultInput;
        if (hasEdited || changed) {
            var confirmed = window.confirm(confirmationMessage);
            if (!confirmed) {
                return;
            }
        }
        presetValue(defaultInput);
        document.querySelectorAll('.column').forEach((element) => {
            element.scrollTo({ top: 0 });
        });
    };

    let presetValue = (value) => {
        editor.setValue(value);
        editor.revealPosition({ lineNumber: 1, column: 1 });
        editor.focus();
        hasEdited = false;
    };

    // ----- sync scroll position -----

    let initScrollBarSync = (settings) => {
        let checkbox = document.querySelector('#sync-scroll-checkbox');
        checkbox.checked = settings;
        scrollBarSync = settings;

        checkbox.addEventListener('change', (event) => {
            let checked = event.currentTarget.checked;
            scrollBarSync = checked;
            saveScrollBarSettings(checked);
        });
    };

    let enableScrollBarSync = () => {
        scrollBarSync = true;
    };

    let disableScrollBarSync = () => {
        scrollBarSync = false;
    };

    // ----- clipboard utils -----

    let copyToClipboard = (text, successHandler, errorHandler) => {
        navigator.clipboard.writeText(text).then(
            () => {
                successHandler();
            },

            () => {
                errorHandler();
            }
        );
    };

    let notifyCopied = () => {
        let labelElement = document.querySelector("#copy-button a");
        labelElement.innerHTML = "Copied!";
        setTimeout(() => {
            labelElement.innerHTML = "Copy";
        }, 1000)
    };

    // ----- history management -----

    let generateId = () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    };

    let createHistoryItem = (title, content) => {
        const id = generateId();
        const now = new Date();
        const item = {
            id: id,
            title: title || `Untitled ${now.toLocaleDateString()}`,
            content: content || '',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString()
        };

        let history = getHistoryList();
        history.unshift(item); // Add to beginning
        saveHistoryList(history);
        return id;
    };

    let updateHistoryItem = (id, content = null, title = null) => {
        let history = getHistoryList();
        const index = history.findIndex(item => item.id === id);
        if (index !== -1) {
            if (content !== null) {
                history[index].content = content;
            }
            if (title !== null) {
                history[index].title = title;
            }
            history[index].updatedAt = new Date().toISOString();
            saveHistoryList(history);
            renderHistoryList();
        }
    };

    let deleteHistoryItem = (id) => {
        let history = getHistoryList();
        history = history.filter(item => item.id !== id);
        saveHistoryList(history);
        if (currentHistoryId === id) {
            currentHistoryId = null;
        }
        renderHistoryList();
    };

    let getHistoryList = () => {
        const history = Storehouse.getItem(localStorageNamespace, localStorageHistoryKey);
        return history || [];
    };

    let saveHistoryList = (history) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageHistoryKey, history, expiredAt);
    };

    let loadHistoryItem = (id) => {
        const history = getHistoryList();
        const item = history.find(h => h.id === id);
        if (item) {
            currentHistoryId = id;
            editor.setValue(item.content);
            convert(item.content);
            updateActiveHistoryItem(id);
        }
    };

    let getHistoryItemTitle = (content) => {
        // Extract first line as title, remove markdown heading syntax
        const lines = content.split('\n');
        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                return trimmed.replace(/^#+\s*/, '').substring(0, 50);
            }
        }
        return 'Untitled';
    };

    let formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    };

    let getPreviewText = (content) => {
        // Remove markdown syntax and get first few words
        return content
            .replace(/#+\s*/g, '') // Remove headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
            .replace(/\*(.*?)\*/g, '$1') // Remove italic
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
            .replace(/`(.*?)`/g, '$1') // Remove inline code
            .split('\n')
            .filter(line => line.trim())
            .slice(0, 2)
            .join(' ')
            .substring(0, 100);
    };

    let renderHistoryList = () => {
        const historyContainer = document.getElementById('history-list');
        const history = getHistoryList();

        historyContainer.innerHTML = '';

        if (history.length === 0) {
            historyContainer.innerHTML = '<div class="no-history">No files yet. Start typing to create your first file!</div>';
            return;
        }

        history.forEach(item => {
            const historyElement = document.createElement('div');
            historyElement.className = 'history-item';
            if (item.id === currentHistoryId) {
                historyElement.classList.add('active');
            }

            const title = item.title || getHistoryItemTitle(item.content);
            const preview = getPreviewText(item.content);

            historyElement.innerHTML = `
                <div class="history-header">
                    <div class="history-title" data-item-id="${item.id}">${title}</div>
                    <button class="history-delete-btn" title="Delete file">✕</button>
                </div>
                <div class="history-date">${formatDate(item.updatedAt)}</div>
                ${preview ? `<div class="history-preview">${preview}</div>` : ''}
            `;

            // Click to load file
            historyElement.addEventListener('click', (e) => {
                // Don't load if clicking on delete button or title input
                if (e.target.classList.contains('history-delete-btn') || e.target.tagName === 'INPUT') return;
                loadHistoryItem(item.id);
            });

            // Delete button
            const deleteBtn = historyElement.querySelector('.history-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${title}"?`)) {
                    deleteHistoryItem(item.id);
                }
            });

            // Double-click title to edit
            const titleElement = historyElement.querySelector('.history-title');
            titleElement.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                editHistoryTitle(item.id, titleElement);
            });

            historyContainer.appendChild(historyElement);
        });
    };

    let editHistoryTitle = (itemId, titleElement) => {
        const currentTitle = titleElement.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'history-title-input';
        input.value = currentTitle;

        // Replace title with input
        titleElement.style.display = 'none';
        titleElement.parentNode.insertBefore(input, titleElement);
        input.focus();
        input.select();

        const saveTitle = () => {
            const newTitle = input.value.trim();
            if (newTitle && newTitle !== currentTitle) {
                updateHistoryItem(itemId, null, newTitle);
                titleElement.textContent = newTitle;
            }
            input.remove();
            titleElement.style.display = 'block';
        };

        const cancelEdit = () => {
            input.remove();
            titleElement.style.display = 'block';
        };

        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveTitle();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });

        // Save on blur
        input.addEventListener('blur', saveTitle);

        // Prevent event bubbling
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    };

    let updateActiveHistoryItem = (id) => {
        document.querySelectorAll('.history-item').forEach(item => {
            item.classList.remove('active');
        });

        const history = getHistoryList();
        const index = history.findIndex(item => item.id === id);
        if (index !== -1) {
            const historyElements = document.querySelectorAll('.history-item');
            if (historyElements[index]) {
                historyElements[index].classList.add('active');
            }
        }
    };

    // ----- setup -----

    // setup navigation actions
    let setupResetButton = () => {
        document.querySelector("#reset-button").addEventListener('click', (event) => {
            event.preventDefault();
            reset();
        });
    };

    let setupCopyButton = (editor) => {
        document.querySelector("#copy-button").addEventListener('click', (event) => {
            event.preventDefault();
            let value = editor.getValue();
            copyToClipboard(value, () => {
                notifyCopied();
            },
                () => {
                    // nothing to do
                });
        });
    };

    let setupSidebar = () => {
        // Toggle sidebar
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('collapsed');

            const toggleBtn = document.getElementById('toggle-sidebar');
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
        });

        // New file button
        document.getElementById('new-file').addEventListener('click', () => {
            const content = editor.getValue();
            if (content.trim() && content !== defaultInput) {
                // Save current content as new history item
                const title = getHistoryItemTitle(content);
                const newId = createHistoryItem(title, content);
                currentHistoryId = newId;
                renderHistoryList();
                updateActiveHistoryItem(newId);
            } else {
                // Create new empty file
                editor.setValue('');
                currentHistoryId = null;
                updateActiveHistoryItem(null);
            }
        });

        // Initial render
        renderHistoryList();
    };

    // ----- local state -----

    let loadLastContent = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageKey);
        return lastContent;
    };

    let saveLastContent = (content) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageKey, content, expiredAt);
    };

    let loadScrollBarSettings = () => {
        let lastContent = Storehouse.getItem(localStorageNamespace, localStorageScrollBarKey);
        return lastContent;
    };

    let saveScrollBarSettings = (settings) => {
        let expiredAt = new Date(2099, 1, 1);
        Storehouse.setItem(localStorageNamespace, localStorageScrollBarKey, settings, expiredAt);
    };

    let setupDivider = () => {
        let lastLeftRatio = 0.5;
        const divider = document.getElementById('split-divider');
        const leftPane = document.getElementById('edit');
        const rightPane = document.getElementById('preview');
        const container = document.getElementById('main-content');

        let isDragging = false;

        divider.addEventListener('mouseenter', () => {
            divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!isDragging) {
                divider.classList.remove('hover');
            }
        });

        divider.addEventListener('mousedown', () => {
            isDragging = true;
            divider.classList.add('active');
            document.body.style.cursor = 'col-resize';
        });

        divider.addEventListener('dblclick', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const halfWidth = (totalWidth - dividerWidth) / 2;

            leftPane.style.width = halfWidth + 'px';
            rightPane.style.width = halfWidth + 'px';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            document.body.style.userSelect = 'none';
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const offsetX = e.clientX - containerRect.left;
            const dividerWidth = divider.offsetWidth;

            // Prevent overlap or out-of-bounds
            const minWidth = 100;
            const maxWidth = totalWidth - minWidth - dividerWidth;
            const leftWidth = Math.max(minWidth, Math.min(offsetX, maxWidth));
            leftPane.style.width = leftWidth + 'px';
            rightPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                divider.classList.remove('active');
                divider.classList.remove('hover');
                document.body.style.cursor = 'default';
                document.body.style.userSelect = '';
            }
        });

        window.addEventListener('resize', () => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;

            const newLeft = availableWidth * lastLeftRatio;
            const newRight = availableWidth * (1 - lastLeftRatio);

            leftPane.style.width = newLeft + 'px';
            rightPane.style.width = newRight + 'px';
        });
    };

    // ----- entry point -----
    let lastContent = loadLastContent();
    let editor = setupEditor();
    if (lastContent) {
        presetValue(lastContent);
    } else {
        presetValue(defaultInput);
    }
    setupResetButton();
    setupCopyButton(editor);
    setupSidebar();

    let scrollBarSettings = loadScrollBarSettings() || false;
    initScrollBarSync(scrollBarSettings);

    setupDivider();
};

window.addEventListener("load", () => {
    init();
});
