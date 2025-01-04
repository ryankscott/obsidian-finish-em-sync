import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { v4 as uuid } from "uuid";

const ALL_TASK_REGEX = RegExp(/^\s*(- \[ \] )(.+)/, "gm");
type Todo = {
	text: string;
	done?: boolean;
	charNo?: number;
};
interface FinishEmSyncSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: FinishEmSyncSettings = {
	mySetting: "default",
};
const sendTodosToFinishEm = async (todos: string[]) => {
	try {
		await Promise.all(
			todos.map(async (t) => {
				const result = await fetch("http://localhost:4000/graphql", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						query: `
  mutation CreateItem(
	$key: String!
	$type: String!
	$text: String!
  ) {
	createItem(
	  input: {
		key: $key
		type: $type
		text: $text
	  }
	) {
	  key
	  type
	  text
	  project {
		key
	  }
	}
  }
	  `,
						variables: {
							key: uuid(),
							type: "TODO",
							text: t,
						},
					}),
				});
				if (!result.ok) {
					console.log(
						`Failed to send todos to Finish Em - ${result.text()}`
					);
					return false;
				}
				return result;
			})
		);
	} catch (err) {
		`Failed to send todos to Finish Em - ${err}`;
		return false;
	}

	return;
};

const updateTodos = async (todos: Todo[], content: string) => {
	const newContent = content.replace(ALL_TASK_REGEX, (match) => {
		const exists = todos.filter((t) => {
			return match.includes(t.text);
		});
		if (exists.length > 0) {
			return match.replace("[ ] ", "[x] ~~");
		}
		return match;
	});
	return newContent;
};

const extractTodos = (content: string): Todo[] => {
	const todos: Todo[] = [];

	let result;
	while ((result = ALL_TASK_REGEX.exec(content))) {
		todos.push({
			text: result[2],
			charNo: result[0].length,
		});
	}

	return todos;
};

export default class FinishEmSync extends Plugin {
	settings: FinishEmSyncSettings;
	statusBarItem: HTMLElement | null;

	async setStatusBarText() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			return;
		}
		const content = await this.app.vault.read(file);
		const todos = extractTodos(content);

		this.statusBarItem?.setText(`Found ${todos.length} todos`);
	}

	async onload() {
		// Create the status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText("Initializing...");
		this.setStatusBarText();

		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"circle-check-big",
			"Send to Finish-Em ",
			async (evt: MouseEvent) => {
				// Called when the user clicks the icon.
				const file = this.app.workspace.getActiveFile();
				const obsidianURI = `obsidian://open?vault=${file?.vault.adapter.getName()}&file=${
					file?.name
				}`;
				console.log({ obsidianURI });
				if (!file) {
					new Notice("No active file open.");
					return;
				}

				const content = await this.app.vault.read(file);
				const todos = extractTodos(content);

				const modal = new TasksModal(this.app);
				modal.setTitle("Send to Finish-Em");

				// Create a DocumentFragment
				const fragment = document.createDocumentFragment();

				// Add multiple elements to the fragment
				const header = document.createElement("h3");
				header.textContent = `Found ${todos.length} todos:`;
				fragment.appendChild(header);

				const list = document.createElement("ul");
				todos.forEach((todo, index) => {
					const checkbox = document.createElement("input");
					checkbox.type = `checkbox`;
					checkbox.value = todo.text;
					checkbox.checked = true;
					checkbox.id = `checkbox-${index}`;

					const label = document.createElement("label");
					label.htmlFor = `checkbox-${index}`;
					label.textContent = todo.text;
					list.appendChild(checkbox);
					list.appendChild(label);

					list.appendChild(document.createElement("br"));
				});
				fragment.appendChild(list);
				modal.setContent(fragment);

				const submitBtn = new Setting(modal.contentEl).addButton(
					(btn) =>
						btn
							.setButtonText("Submit")
							.setCta()
							.onClick(async () => {
								const checkedTodos = Array.from(
									document.getElementsByTagName("input")
								)
									.filter((input) => input.checked)
									.map((i) => i.value);

								sendTodosToFinishEm(
									todos.map(
										(t) =>
											`${t.text} <a href="${obsidianURI}">notes link</a>`
									)
								);
								const newContent = await updateTodos(
									todos.filter((t) =>
										checkedTodos.includes(t.text)
									),
									content
								);
								this.app.vault.modify(file, newContent);
								modal.close();
							})
				);

				modal.open();
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-finish-em-modal",
			name: "Send to Finish Em",
			callback: () => {
				new TasksModal(this.app).open();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		//	this.addSettingTab(new FinishEmSyncSettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(async () => {
				this.setStatusBarText();
			}, 10 * 1000)
		);
	}

	onunload() {
		// Remove the status bar item
		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TasksModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		/*	const { contentEl } = this;
		// Add a root div for React
		const reactRootDiv = document.createElement("div");
		contentEl.appendChild(reactRootDiv);

		// Render the React app (React 18)
		const root = createRoot(reactRootDiv);
		root.render(<ReactModal todos={["one", "two", "three"]} />);
		*/
	}

	onClose() {
		const { contentEl } = this;
		//		this.root?.unmount();
		contentEl.empty();
	}
}

class FinishEmSyncSettingTab extends PluginSettingTab {
	plugin: FinishEmSync;

	constructor(app: App, plugin: FinishEmSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
