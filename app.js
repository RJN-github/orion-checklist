'use strict';

/* ------------------------------------------------------------------ *
 * My Checklist — lists (events) -> categories -> items
 * Data lives in this phone's browser. A JSON seed lives in the repo.
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'my-checklist-v1';
const SEED_PATH = 'data/checklist.json';

const el = {
  chips: document.getElementById('listChips'),
  main: document.getElementById('main'),
  menuButton: document.getElementById('menuButton'),
  addItemButton: document.getElementById('addItemButton'),
  addCategoryButton: document.getElementById('addCategoryButton'),
  scrim: document.getElementById('scrim'),
  sheet: document.getElementById('sheet'),
  sheetTitle: document.getElementById('sheetTitle'),
  sheetBody: document.getElementById('sheetBody'),
  sheetClose: document.getElementById('sheetClose'),
  toast: document.getElementById('toast'),
  fileInput: document.getElementById('fileInput'),
};

const app = {
  data: { version: 1, updatedAt: null, lists: [] },
  activeListId: null,
  lastCategoryId: null,
  sheetOpen: false,
};

const ICON_PATHS = {
  check:
    '<path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  pencil:
    '<path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 5.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  download:
    '<path d="M12 4v11m0 0l4-4m-4 4l-4-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  upload:
    '<path d="M12 20V9m0 0l4 4m-4-4l-4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
};

/* ---------- small helpers ---------- */

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function h(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else node.setAttribute(key, value === true ? '' : String(value));
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
  }
  return node;
}

function iconEl(name, size) {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' });
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="' +
    (size || 20) +
    '" height="' +
    (size || 20) +
    '" fill="currentColor" focusable="false">' +
    (ICON_PATHS[name] || '') +
    '</svg>';
  return span;
}

function cleanName(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\s+/g, ' ').trim() || fallback;
}

function invalidate(input) {
  input.classList.add('is-invalid');
  input.focus();
  input.addEventListener('input', () => input.classList.remove('is-invalid'), { once: true });
}

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('is-open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-open'), 2200);
}

/* ---------- data ---------- */

function normalize(raw) {
  const data = { version: 1, updatedAt: null, lists: [] };
  const seen = new Set();

  function freshId(value, prefix) {
    let id = typeof value === 'string' && value.trim() ? value.trim() : uid(prefix);
    while (seen.has(id)) id = uid(prefix);
    seen.add(id);
    return id;
  }

  const source = raw && typeof raw === 'object' && Array.isArray(raw.lists) ? raw : { lists: [] };

  source.lists.forEach((rawList) => {
    if (!rawList || typeof rawList !== 'object') return;
    const list = {
      id: freshId(rawList.id, 'list'),
      name: cleanName(rawList.name, 'Untitled list'),
      categories: [],
    };
    (Array.isArray(rawList.categories) ? rawList.categories : []).forEach((rawCat) => {
      if (!rawCat || typeof rawCat !== 'object') return;
      const cat = { id: freshId(rawCat.id, 'cat'), name: cleanName(rawCat.name, 'General'), items: [] };
      (Array.isArray(rawCat.items) ? rawCat.items : []).forEach((rawItem) => {
        if (!rawItem || typeof rawItem !== 'object') return;
        const name = cleanName(rawItem.name, '');
        if (!name) return;
        cat.items.push({ id: freshId(rawItem.id, 'item'), name, done: Boolean(rawItem.done) });
      });
      list.categories.push(cat);
    });
    data.lists.push(list);
  });

  return data;
}

function activeList() {
  return app.data.lists.find((list) => list.id === app.activeListId) || app.data.lists[0] || null;
}

function createList(name) {
  return { id: uid('list'), name: name || 'New list', categories: [{ id: uid('cat'), name: 'General', items: [] }] };
}

function persist() {
  app.data.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(app.data));
  } catch (error) {
    toast('Could not save on this device');
  }
}

function commit() {
  persist();
  render();
}

function countItems(list) {
  let total = 0;
  let done = 0;
  list.categories.forEach((cat) => {
    total += cat.items.length;
    cat.items.forEach((item) => {
      if (item.done) done += 1;
    });
  });
  return { total, done };
}

/* ---------- render ---------- */

function render(focusSelector) {
  const list = activeList();
  if (list) app.activeListId = list.id;
  renderChips(list);

  el.main.textContent = '';
  if (!list) return;

  el.main.append(summaryCard(list));
  list.categories.forEach((cat) => el.main.append(categorySection(cat)));
  el.main.append(
    h('button', { class: 'addcat', type: 'button', onclick: () => openCategorySheet() }, [
      iconEl('plus', 18),
      h('span', { text: 'Add category' }),
    ])
  );

  if (!list.categories.length) {
    el.main.append(
      h('p', {
        class: 'hint',
        text: 'Categories keep a big list tidy — like “Pooja items”, “Flowers”, “Groceries”.',
      })
    );
  }

  if (focusSelector) {
    const next = document.querySelector(focusSelector);
    if (next) next.focus({ preventScroll: true });
  }
}

function renderChips(list) {
  el.chips.textContent = '';
  app.data.lists.forEach((entry) => {
    const isActive = Boolean(list) && entry.id === list.id;
    el.chips.append(
      h('button', {
        class: 'chip' + (isActive ? ' is-active' : ''),
        type: 'button',
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        text: entry.name,
        onclick: () => {
          app.activeListId = entry.id;
          render();
        },
      })
    );
  });
  el.chips.append(
    h('button', {
      class: 'chip chip--add',
      type: 'button',
      text: '+ New list',
      onclick: () => openListSheet({ mode: 'create' }),
    })
  );
}

function summaryCard(list) {
  const { total, done } = countItems(list);
  const pct = total ? Math.round((done / total) * 100) : 0;
  let meta = 'No items yet — tap “+ Add item”.';
  if (total && done === total) meta = 'All ' + total + ' items are ticked off';
  else if (total) meta = done + ' of ' + total + ' ticked off';

  return h('div', { class: 'summary' }, [
    h('div', { class: 'summary__head' }, [
      h('h2', { class: 'summary__name', text: list.name }),
      h(
        'button',
        {
          class: 'iconbtn iconbtn--sm',
          type: 'button',
          'aria-label': 'Rename or delete this list',
          onclick: () => openListSheet({ list }),
        },
        [iconEl('dots', 20)]
      ),
    ]),
    h('p', { class: 'summary__meta', text: meta }),
    total
      ? h('div', { class: 'bar' }, [h('span', { class: 'bar__fill', style: 'width:' + pct + '%' })])
      : null,
  ]);
}

function categorySection(cat) {
  const done = cat.items.filter((item) => item.done).length;
  const section = h('section', { class: 'cat' }, [
    h('div', { class: 'cat__head' }, [
      h('h3', { class: 'cat__name', text: cat.name }),
      cat.items.length ? h('span', { class: 'cat__count', text: done + '/' + cat.items.length }) : null,
      h(
        'button',
        {
          class: 'iconbtn iconbtn--sm',
          type: 'button',
          'aria-label': 'Options for ' + cat.name,
          onclick: () => openCategorySheet({ category: cat }),
        },
        [iconEl('dots', 20)]
      ),
    ]),
  ]);

  if (cat.items.length) {
    const items = h('ul', { class: 'items' });
    cat.items.forEach((item) => items.append(itemRow(item)));
    section.append(items);
  } else {
    section.append(h('p', { class: 'cat__empty', text: 'Nothing here yet.' }));
  }

  section.append(
    h('button', {
      class: 'cat__add',
      type: 'button',
      text: '+ Add item to this category',
      onclick: () => openItemSheet({ categoryId: cat.id }),
    })
  );

  return section;
}

function itemRow(item) {
  return h('li', { class: 'item' + (item.done ? ' is-done' : '') }, [
    h(
      'button',
      {
        class: 'item__main',
        type: 'button',
        'aria-pressed': item.done ? 'true' : 'false',
        'aria-label': item.name + (item.done ? ' — ticked. Tap to undo.' : ''),
        'data-toggle': item.id,
        onclick: () => {
          item.done = !item.done;
          persist();
          render('[data-toggle="' + item.id + '"]');
        },
      },
      [h('span', { class: 'check' }, [iconEl('check', 20)]), h('span', { class: 'item__name', text: item.name })]
    ),
    h(
      'button',
      {
        class: 'iconbtn iconbtn--sm item__edit',
        type: 'button',
        'aria-label': 'Edit ' + item.name,
        onclick: () => openItemSheet({ item: item }),
      },
      [iconEl('pencil', 19)]
    ),
  ]);
}

/* ---------- sheets ---------- */

function openSheet(title, build) {
  el.sheetTitle.textContent = title;
  el.sheetBody.textContent = '';
  build(el.sheetBody);
  el.scrim.hidden = false;
  el.sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  app.sheetOpen = true;

  // Read a layout value first so the browser has the closed state to slide from.
  void el.sheet.offsetHeight;
  el.scrim.classList.add('is-open');
  el.sheet.classList.add('is-open');

  const firstField = el.sheetBody.querySelector('input, textarea');
  if (firstField) {
    firstField.focus({ preventScroll: true });
    if (firstField.select) firstField.select();
  }
}

function closeSheet() {
  if (!app.sheetOpen) return;
  app.sheetOpen = false;
  el.sheet.classList.remove('is-open');
  el.scrim.classList.remove('is-open');
  document.body.style.overflow = '';

  setTimeout(() => {
    if (app.sheetOpen) return;
    el.sheet.hidden = true;
    el.scrim.hidden = true;
    el.sheetBody.textContent = '';
  }, 260);
}

function openItemSheet(options) {
  const list = activeList();
  if (!list) return;
  const settings = options || {};
  const item = settings.item || null;
  const owner = item ? list.categories.find((cat) => cat.items.some((row) => row.id === item.id)) : null;
  const preferred =
    list.categories.find((cat) => cat.id === settings.categoryId) ||
    list.categories.find((cat) => cat.id === app.lastCategoryId) ||
    list.categories[0];
  let categoryId = owner ? owner.id : preferred ? preferred.id : null;

  openSheet(item ? 'Edit item' : 'Add item', (body) => {
    const form = h('form', { class: 'form', novalidate: true });

    const input = h('input', {
      class: 'field__input',
      id: 'itemName',
      type: 'text',
      maxlength: 140,
      autocomplete: 'off',
      placeholder: 'e.g. Sugar 1 kg',
      enterkeyhint: 'done',
      value: item ? item.name : '',
    });

    const picker = h('div', { class: 'picker' });
    const newName = h('input', {
      class: 'field__input field__input--sm',
      type: 'text',
      maxlength: 60,
      autocomplete: 'off',
      placeholder: 'New category name',
    });
    const newAdd = h('button', { class: 'btn btn--secondary btn--compact', type: 'button', text: 'Add' });
    const newRow = h('div', { class: 'inline-add', hidden: true }, [newName, newAdd]);

    function paintPicker() {
      picker.textContent = '';
      list.categories.forEach((cat) => {
        const active = cat.id === categoryId;
        picker.append(
          h('button', {
            class: 'chip chip--pick' + (active ? ' is-active' : ''),
            type: 'button',
            'aria-pressed': active ? 'true' : 'false',
            text: cat.name,
            onclick: () => {
              categoryId = cat.id;
              paintPicker();
            },
          })
        );
      });
      picker.append(
        h('button', {
          class: 'chip chip--pick chip--add',
          type: 'button',
          text: '+ New',
          onclick: () => {
            newRow.hidden = false;
            newName.focus();
          },
        })
      );
    }

    newAdd.addEventListener('click', () => {
      const name = cleanName(newName.value, '');
      if (!name) {
        newName.focus();
        return;
      }
      const cat = { id: uid('cat'), name: name, items: [] };
      list.categories.push(cat);
      categoryId = cat.id;
      app.lastCategoryId = cat.id;
      newName.value = '';
      newRow.hidden = true;
      persist();
      render();
      paintPicker();
      input.focus();
    });

    newName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        newAdd.click();
      }
    });

    paintPicker();

    form.append(
      h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: 'itemName', text: 'Item name' }),
        input,
      ]),
      h('div', { class: 'field' }, [h('span', { class: 'field__label', text: 'Category' }), picker, newRow]),
      h('button', {
        class: 'btn btn--primary btn--block',
        type: 'submit',
        text: item ? 'Save changes' : 'Add to list',
      })
    );

    if (item) {
      form.append(
        h('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          text: 'Delete item',
          onclick: () => {
            if (!confirm('Delete “' + item.name + '”?')) return;
            list.categories.forEach((cat) => {
              cat.items = cat.items.filter((row) => row.id !== item.id);
            });
            closeSheet();
            commit();
          },
        })
      );
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = cleanName(input.value, '');
      if (!name) {
        invalidate(input);
        return;
      }

      let cat = list.categories.find((entry) => entry.id === categoryId);
      if (!cat) {
        cat = { id: uid('cat'), name: 'General', items: [] };
        list.categories.push(cat);
      }

      if (item) {
        item.name = name;
        if (owner && owner.id !== cat.id) {
          owner.items = owner.items.filter((row) => row.id !== item.id);
          cat.items.push(item);
        }
      } else {
        cat.items.push({ id: uid('item'), name: name, done: false });
      }

      app.lastCategoryId = cat.id;
      closeSheet();
      commit();
    });

    body.append(form);
  });
}

function openCategorySheet(options) {
  const list = activeList();
  if (!list) return;
  const settings = options || {};
  const editing = Boolean(settings.category);

  openSheet(editing ? 'Category options' : 'New category', (body) => {
    const form = h('form', { class: 'form', novalidate: true });
    const input = h('input', {
      class: 'field__input',
      id: 'categoryName',
      type: 'text',
      maxlength: 60,
      autocomplete: 'off',
      placeholder: 'e.g. Flowers, Groceries',
      enterkeyhint: 'done',
      value: editing ? settings.category.name : '',
    });

    form.append(
      h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: 'categoryName', text: 'Category name' }),
        input,
      ]),
      h('button', {
        class: 'btn btn--primary btn--block',
        type: 'submit',
        text: editing ? 'Save name' : 'Add category',
      })
    );

    if (editing) {
      const count = settings.category.items.length;
      form.append(
        h('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          text: count ? 'Delete category and its ' + count + ' items' : 'Delete category',
          onclick: () => {
            if (!confirm('Delete “' + settings.category.name + '”?')) return;
            list.categories = list.categories.filter((cat) => cat.id !== settings.category.id);
            closeSheet();
            commit();
          },
        })
      );
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = cleanName(input.value, '');
      if (!name) {
        invalidate(input);
        return;
      }
      if (editing) {
        settings.category.name = name;
      } else {
        const cat = { id: uid('cat'), name: name, items: [] };
        list.categories.push(cat);
        app.lastCategoryId = cat.id;
      }
      closeSheet();
      commit();
    });

    body.append(form);
  });
}

function openListSheet(options) {
  const settings = options || {};
  const creating = settings.mode === 'create';
  const list = creating ? null : settings.list || activeList();
  if (!creating && !list) return;

  openSheet(creating ? 'New list' : 'This list', (body) => {
    const form = h('form', { class: 'form', novalidate: true });
    const input = h('input', {
      class: 'field__input',
      id: 'listName',
      type: 'text',
      maxlength: 60,
      autocomplete: 'off',
      placeholder: 'e.g. Puja shopping, General',
      enterkeyhint: 'done',
      value: creating ? '' : list.name,
    });

    form.append(
      h('div', { class: 'field' }, [h('label', { class: 'field__label', for: 'listName', text: 'List name' }), input])
    );

    if (!creating) {
      form.append(
        h('p', {
          class: 'hint',
          text: 'One list is one event. Tap the lists at the top of the screen to switch.',
        })
      );
    }

    form.append(
      h('button', {
        class: 'btn btn--primary btn--block',
        type: 'submit',
        text: creating ? 'Create list' : 'Save name',
      })
    );

    if (!creating) {
      form.append(
        h('button', {
          class: 'btn btn--danger btn--block',
          type: 'button',
          text: 'Delete this list',
          onclick: () => {
            if (!confirm('Delete “' + list.name + '” and everything in it?')) return;
            app.data.lists = app.data.lists.filter((entry) => entry.id !== list.id);
            if (!app.data.lists.length) app.data.lists.push(createList('My list'));
            app.activeListId = app.data.lists[0].id;
            closeSheet();
            commit();
          },
        })
      );
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = cleanName(input.value, '');
      if (!name) {
        invalidate(input);
        return;
      }
      if (creating) {
        const fresh = createList(name);
        app.data.lists.push(fresh);
        app.activeListId = fresh.id;
      } else {
        list.name = name;
      }
      closeSheet();
      commit();
    });

    body.append(form);
  });
}

/* ---------- more options ---------- */

function actionRow(icon, title, sub, onClick) {
  return h('button', { class: 'rowbtn', type: 'button', onclick: onClick }, [
    iconEl(icon, 22),
    h('span', { class: 'rowbtn__text' }, [
      h('span', { class: 'rowbtn__title', text: title }),
      h('span', { class: 'rowbtn__sub', text: sub }),
    ]),
  ]);
}

function openMenuSheet() {
  openSheet('More options', (body) => {
    body.append(
      h('h3', { class: 'sheet__section', text: 'Backup' }),
      actionRow('download', 'Download backup file', 'Save a copy of all lists as a .json file', downloadBackup),
      actionRow('upload', 'Restore from backup file', 'Replace everything with a saved .json file', () => {
        closeSheet();
        el.fileInput.click();
      }),
      h('h3', { class: 'sheet__section', text: 'This list' }),
      actionRow('check', 'Untick all items', 'Keep the items, start the list again', untickAll),
      h('h3', { class: 'sheet__section', text: 'Where is my list saved?' }),
      h('p', {
        class: 'hint',
        text: 'Your list is saved inside this phone’s browser, so it works without internet. Download a backup now and then to keep a copy in the GitHub repository.',
      })
    );
  });
}

function downloadBackup() {
  const text = JSON.stringify(app.data, null, 2) + '\n';
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', {
    href: url,
    download: 'checklist-backup-' + new Date().toISOString().slice(0, 10) + '.json',
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup downloaded');
}

function untickAll() {
  const list = activeList();
  if (!list) return;
  if (!confirm('Untick every item in “' + list.name + '”?')) return;
  list.categories.forEach((cat) => {
    cat.items.forEach((item) => {
      item.done = false;
    });
  });
  closeSheet();
  commit();
}

async function restoreFromFile() {
  const file = el.fileInput.files && el.fileInput.files[0];
  el.fileInput.value = '';
  if (!file) return;

  let incoming = null;
  try {
    incoming = normalize(JSON.parse(await file.text()));
  } catch (error) {
    incoming = null;
  }
  if (!incoming || !incoming.lists.length) {
    alert('That file could not be read. Please choose a checklist backup (.json) file.');
    return;
  }
  if (!confirm('Replace all lists on this phone with this backup file?')) return;

  app.data = incoming;
  app.activeListId = incoming.lists[0].id;
  app.lastCategoryId = null;
  commit();
  toast('Backup loaded');
}

/* ---------- boot ---------- */

async function loadSeed() {
  try {
    const response = await fetch(SEED_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return normalize(await response.json());
  } catch (error) {
    return { version: 1, updatedAt: null, lists: [] };
  }
}

async function boot() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    stored = null;
  }

  if (stored) {
    try {
      app.data = normalize(JSON.parse(stored));
    } catch (error) {
      app.data = { version: 1, updatedAt: null, lists: [] };
    }
  } else {
    app.data = await loadSeed();
    persist();
  }

  if (!app.data.lists.length) app.data.lists.push(createList('My list'));

  app.activeListId = app.data.lists[0].id;
  render();
}

el.addItemButton.addEventListener('click', () => openItemSheet());
el.addCategoryButton.addEventListener('click', () => openCategorySheet());
el.menuButton.addEventListener('click', openMenuSheet);
el.sheetClose.addEventListener('click', closeSheet);
el.scrim.addEventListener('click', closeSheet);
el.fileInput.addEventListener('change', restoreFromFile);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && app.sheetOpen) closeSheet();
});

boot();
