const {Plugin, Setting, getActiveEditor, getModelByDockType} = require("siyuan");

const CONFIG = "settings.json";
const TREE_SELECTOR = ".sy__file, #sidebar .fn__flex-column[data-type='sidebar-file']";

module.exports = class AutoLocateDoc extends Plugin {
    async onload() {
        this.disposed = false;
        this.timers = new Set();
        this.lastKey = "";
        this.lastAt = 0;

        await this.loadData(CONFIG);
        const saved = (this.data && this.data[CONFIG]) || {};
        this.config = Object.assign({
            enabled: true,
            locateOnClick: true
        }, saved);

        this.handleSwitch = () => this.locate("switch");
        this.handleClick = (event) => {
            if (this.disposed || !this.config.enabled || !this.config.locateOnClick) return;
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!target.closest(".protyle")) return;
            this.locate("click");
        };
        document.addEventListener("click", this.handleClick, true);

        this.initSetting();
        console.log("[auto-locate-doc]", this.i18n.loaded);
    }

    onLayoutReady() {
        if (this.disposed) return;
        try {
            this.eventBus.on("loaded-protyle-static", this.handleSwitch);
            this.eventBus.on("switch-protyle", this.handleSwitch);
        } catch (e) {
            // 事件名不可用时仅保留点击触发
        }
        this.locate("ready");
    }

    onunload() {
        this.disposed = true;
        try { this.eventBus.off("loaded-protyle-static", this.handleSwitch); } catch (e) {}
        try { this.eventBus.off("switch-protyle", this.handleSwitch); } catch (e) {}
        document.removeEventListener("click", this.handleClick, true);
        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
        if (this.setting && typeof this.setting.destroy === "function") {
            try { this.setting.destroy(); } catch (e) {}
        }
        console.log("[auto-locate-doc]", this.i18n.unloaded);
    }

    later(fn, ms) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            if (!this.disposed) fn();
        }, ms);
        this.timers.add(timer);
        return timer;
    }

    currentTarget() {
        try {
            const editor = getActiveEditor(false);
            const protyle = editor && editor.protyle;
            if (!protyle || !protyle.notebookId || !protyle.path) return null;
            return {notebookId: protyle.notebookId, path: protyle.path};
        } catch (e) {
            return null;
        }
    }

    treeVisible() {
        const tree = document.querySelector(TREE_SELECTOR);
        if (!tree) return false;
        const rect = tree.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
    }

    locate(reason) {
        if (this.disposed || !this.config.enabled) return;
        if (!this.treeVisible()) return;

        let model = null;
        try {
            model = typeof getModelByDockType === "function" ? getModelByDockType("file") : null;
        } catch (e) {
            return;
        }
        if (!model || typeof model.selectItem !== "function") return;

        const target = this.currentTarget();
        if (!target) return;

        const key = target.notebookId + "|" + target.path;
        const now = Date.now();
        if (key === this.lastKey && now - this.lastAt < 1000) return;
        this.lastKey = key;
        this.lastAt = now;

        const previous = document.activeElement;
        const inEditor = !!(previous && previous.closest && previous.closest(".protyle"));

        try {
            model.selectItem(target.notebookId, target.path);
        } catch (e) {
            return;
        }

        if (inEditor) {
            this.later(() => {
                try { previous.focus({preventScroll: true}); } catch (e) {}
            }, 180);
        }
        if (reason === "ready" || reason === "setting") {
            console.log("[auto-locate-doc]", reason, target.path);
        }
    }

    initSetting() {
        this.setting = new Setting({
            confirmCallback: () => {
                this.persist();
            }
        });

        const toggle = (key) => {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "b3-switch fn__flex-center";
            input.checked = !!this.config[key];
            input.addEventListener("change", () => {
                this.config[key] = input.checked;
            });
            return input;
        };

        this.setting.addItem({
            title: this.i18n.enabled,
            description: this.i18n.enabledDesc,
            createActionElement: () => toggle("enabled")
        });
        this.setting.addItem({
            title: this.i18n.locateOnClick,
            description: this.i18n.locateOnClickDesc,
            createActionElement: () => toggle("locateOnClick")
        });
    }

    async persist() {
        this.lastKey = "";
        this.lastAt = 0;
        await this.saveData(CONFIG, this.config);
        if (this.config.enabled) {
            this.locate("setting");
        }
    }
};
