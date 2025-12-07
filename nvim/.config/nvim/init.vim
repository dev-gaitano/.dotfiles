scriptencoding utf-8

" BASE SETTINGS
let mapleader = "\<Space>"

" Line Numbers set number
set number
set relativenumber
set cursorline
set conceallevel=2

" Display, indentation and Wrapping
set autoindent
set smarttab
set cindent
set textwidth=80
set cmdheight=2
set wrap
set linebreak
set termguicolors
set scrolloff=8
set colorcolumn=80
set signcolumn=yes

" Performance
set shortmess+=c

" Files
set nobackup
set nowritebackup
set noswapfile
let &undodir = expand('$HOME/.vim/undodir')
set undofile
set isfname+=@-@

" Search
set hidden
set incsearch
set nohlsearch

" Syntax
syntax on

" Filetype Specific Settings 
augroup FiletypeSettings
  autocmd FileType python,c,cpp setlocal tabstop=4 shiftwidth=4 softtabstop=4 expandtab
  autocmd FileType html,css,javascript,typescript,typescriptreact,javascriptreact,lua,vim setlocal tabstop=2 shiftwidth=2 softtabstop=2 expandtab
augroup END


"SYSTEM REMAPS
" Exit mode with 'j+k'
inoremap jk <ESC>l       " Works in insert mode"
vnoremap jk <ESC>l       " Works in Visual Mode
tnoremap jk <C-\><C-n>  " Works in Terminal Mode 

nnoremap K :lua require("hover").hover()<CR>
nnoremap gK :lua require("hover").hover_select()<CR>
nnoremap <leader>d :lua require("hover.providers.dictionary").hover()<CR>

" Use Ctrl + Tab / Ctrl + Shift + Tab to switch tabs
nnoremap <C-Tab>   :tabnext<CR>
nnoremap <C-A-t> :tabprevious<CR>

" Open a new tab quickly
nnoremap <C-t> :tabnew<CR>

" Close the current tab
nnoremap <C-w> :tabclose<CR>

" Use Alt + Arrow Keys to move between splits
nnoremap <A-Left>  :leftabove vsplit<CR>
nnoremap <A-Down>  :split<CR>
nnoremap <A-Up>    :aboveleft split<CR>
nnoremap <A-Right> :vsplit<CR>

" Use Ctrl+` to open terminal
nnoremap <C-p> :belowright split<CR>:terminal<CR>

" Remap terminal exit shortcut
tnoremap <Esc> <C-\><C-n>

" Resize splits using Shift + Arrow keys
nnoremap <S-Left>  :vertical resize -5<CR>
nnoremap <S-Right> :vertical resize +5<CR>
nnoremap <S-Up>    :resize +5<CR>
nnoremap <S-Down>  :resize -5<CR>

" Browser-sync (works like live server)
nnoremap <leader>bs :!browser-sync start --server --files "*.html, css/*.css, js/*.js" &<CR>

" Move highlighted block
vnoremap J :m '>+1<CR>gv=gv
vnoremap K :m '<-2<CR>gv=gv

" Keeps cursor at line start 
nnoremap J mzJ`z

" Keeps cursor centered on the screen
nnoremap <C-d> <C-d>zz
nnoremap <C-u> <C-u>zz

nnoremap n nzzzv
nnoremap N Nzzzv

" Pastes the yanked text over the highlighted one without the highlighted one storing in the buffer
xnoremap <leader>p "_dP

" Seperate vim clipboard and system clipboard
nnoremap <leader>y "+y
vnoremap <leader>y "+y
nnoremap <leader>Y "+Y

" Open a new tmux session silently
nnoremap <C-f> :silent !tmux neww tmux-sessionizer<CR>

" Disable the Q command
nnoremap Q <nop>

" initiates a search-and-replace operation in the whole file
nnoremap <leader>s :%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left>


" PLUGINS
call plug#begin('~/.local/share/nvim/site/plugged')

Plug 'nvim-tree/nvim-tree.lua'        " File tree
Plug 'nvim-tree/nvim-web-devicons'    " Icons
Plug 'preservim/nerdcommenter'        " Enables quick commenting in code
Plug 'christoomey/vim-tmux-navigator' " Navigation between Vim and Tmux splits 
Plug 'nvim-lua/plenary.nvim'          " Lua utility library
Plug 'nvim-lua/popup.nvim'            " Popup API for Neovim
Plug 'nvim-telescope/telescope.nvim', { 'tag': '0.1.8' } " Fuzzy File Finder
Plug 'nvim-lualine/lualine.nvim'      " Status Bar
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'} " Syntax Highlighting
Plug 'folke/tokyonight.nvim'          " Tokyonight colorscheme
Plug 'neovim/nvim-lspconfig'          " Core LSP support
Plug 'mason-org/mason.nvim'           " Easy LSP installation
Plug 'mason-org/mason-lspconfig.nvim' " Bridge between Mason and lspconfig
Plug 'hrsh7th/nvim-cmp'               " Core autocompletion engine
Plug 'hrsh7th/cmp-nvim-lsp'           " Integrates nvim-cmp with Neovim's built-in LSP
Plug 'hrsh7th/cmp-buffer'             " Buffer completion
Plug 'hrsh7th/cmp-path'               " Path completion
Plug 'lewis6991/hover.nvim'           " Add hover properties
Plug 'lewis6991/gitsigns.nvim'        " Git Wrapper Plugin
Plug 'lukas-reineke/indent-blankline.nvim' " Indentation Guidelines
Plug 'NvChad/nvim-colorizer.lua'      " Highlight colors
Plug 'roobert/tailwindcss-colorizer-cmp.nvim' " Show TailwindCSS colors in preview
Plug 'ThePrimeagen/harpoon'           " Harpoon File Navigator
Plug 'mbbill/undotree'                " Undo Tree
Plug 'ThePrimeagen/vim-be-good'       " Vim Practice Game
Plug 'CopilotC-Nvim/CopilotChat.nvim' " Copilot Chat integration
Plug 'MeanderingProgrammer/render-markdown.nvim' " Render markdown syntax
Plug 'code-biscuits/nvim-biscuits'    " Show code context in the gutter
Plug 'epwalsh/obsidian.nvim'          " Obsidian integration for Neovim
Plug 'folke/zen-mode.nvim'	          " Zen mode
Plug 'folke/twilight.nvim'	          " Dim inactive portions of the code
Plug 'folke/todo-comments.nvim'	      " Highlight TODO comments
Plug 'jiangmiao/auto-pairs'	          " Auto close pairs like brackets, quotes, etc.
Plug 'windwp/nvim-ts-autotag'
Plug 'mracos/mermaid.vim'		          " Render mermaid syntax in neovim
Plug '3rd/image.nvim', { 'do': 'make' }   " render images in terminal buffers
Plug '3rd/diagram.nvim'
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/fzf.vim'
Plug '0x100101/lab.nvim', { 'do': 'cd js && npm ci' }
Plug 'mg979/vim-visual-multi', {'branch': 'master'}
Plug 'rcarriga/nvim-notify'
Plug 'chomosuke/typst-preview.nvim', {'tag': 'v1.*'}
Plug 'hat0uma/csvview.nvim'

call plug#end()


"NVIM TREE
lua << EOF
require("nvim-tree").setup({
  view = {
    width = 30,
  },
  git = {
    enable = true,
    ignore = false,
    timeout = 500,
  },
  update_focused_file = {
    enable = true,
    update_cwd = true,
  },
  renderer = {
    icons = {
      glyphs = {
        default = "",
        symlink = "",
        git = {
          unstaged = "",
          staged = "S",
          unmerged = "",
          renamed = "➜",
          deleted = "",
          untracked = "U",
          ignored = "◌",
        },
        folder = {
          default = "",
          open = "",
          empty = "",
          empty_open = "",
          symlink = "",
        },
      },
    },
  },
})
EOF

nnoremap <C-b> :NvimTreeToggle<CR>


" NVIM WEB ICONS
lua << EOF
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

require("nvim-web-devicons").setup({
  override = {
    js = { icon = "", color = "#cbcb41", name = "Js" },
    ts = { icon = "", color = "#519aba", name = "Ts" },
    css = { icon = "", color = "#336791", name = "Css" },
    py = { icon = "", color = "#3572A5", name = "Py" },
    java = { icon = "", color = "#cc3e44", name = "Java" },
    lock = { icon = "󰌾", color = "#ff0000", name = "Lock" },
    yml = { icon = "פּ", color = "#6d8086", name = "Yml" },
    yaml = { icon = "פּ", color = "#6d8086", name = "Yaml" },
    sh = { icon = "", color = "#4d5a5e", name = "Sh" },
    sql = { icon = "", color = "#ffd700", name = "Sql" },
    db = { icon = "", color = "#ffd700", name = "Db" },
    sqlite = { icon = "", color = "#ffd700", name = "Sqlite" },
    sqlite3 = { icon = "", color = "#ffd700", name = "Sqlite3" },
    postgresql = { icon = "", color = "#336791", name = "Postgresql" },
    mysql = { icon = "", color = "#00758f", name = "Mysql" },
    mongodb = { icon = "", color = "#589636", name = "Mongodb" },
    map = { icon = "󰆑", color = "#cbcb41", name = "Map" },
  },
  default = true,
})
EOF


" TELESCOPE
nnoremap <leader>ff <cmd>lua require('telescope.builtin').find_files()<cr>
nnoremap <leader>fg <cmd>lua require('telescope.builtin').live_grep()<cr>
nnoremap <leader>fb <cmd>lua require('telescope.builtin').buffers()<cr>
nnoremap <leader>fh <cmd>lua require('telescope.builtin').help_tags()<cr>


" LUALINE
lua << EOF
require('lualine').setup {
  options = {
    icons_enabled = true,
    theme = 'auto',
    component_separators = { left = '', right = ''},
    section_separators = { left = '', right = ''},
    disabled_filetypes = {
      statusline = {},
      winbar = {},
    },
    ignore_focus = {},
    always_divide_middle = true,
    always_show_tabline = true,
    globalstatus = false,
    refresh = {
      statusline = 1000,
      tabline = 1000,
      winbar = 1000,
      refresh_time = 16, -- ~60fps
      events = {
        'WinEnter',
        'BufEnter',
        'BufWritePost',
        'SessionLoadPost',
        'FileChangedShellPost',
        'VimResized',
        'Filetype',
        'CursorMoved',
        'CursorMovedI',
        'ModeChanged',
      },
    }
  },
  sections = {
    lualine_a = {'mode'},
    lualine_b = {'branch', 'diff', 'diagnostics'},
    lualine_c = {'filename'},
    lualine_x = {'encoding', 'fileformat', 'filetype'},
    lualine_y = {'progress'},
    lualine_z = {'location'}
  },
  inactive_sections = {
    lualine_a = {},
    lualine_b = {},
    lualine_c = {'filename'},
    lualine_x = {'location'},
    lualine_y = {},
    lualine_z = {}
  },
  tabline = {},
  winbar = {},
  inactive_winbar = {},
  extensions = {}
}
EOF


" TREESITTER
lua << EOF
require('nvim-treesitter.configs').setup({
  ensure_installed = { "python", "javascript", "typescript", "tsx", "lua", "bash", "json", "html", "css", "markdown", "markdown_inline", "c", "cpp" },
    highlight = {
      enable = true, 
    },
})
EOF


" TOKYONIGHT COLORSHCEME
lua << EOF
require("tokyonight").setup({
  style = "night",  -- Options: "night", "storm", "day", "moon"
  transparent = true,
  styles = {
    sidebars = "transparent",
    floats = "transparent",
  },
})

-- Ensure background transparency for UI elements
vim.api.nvim_set_hl(0, "Normal", { bg = "none" })
vim.api.nvim_set_hl(0, "NormalNC", { bg = "none" })
vim.api.nvim_set_hl(0, "NonText", { bg = "none" })
vim.api.nvim_set_hl(0, "LineNr", { bg = "none" })
vim.api.nvim_set_hl(0, "Folded", { bg = "none" })
vim.api.nvim_set_hl(0, "EndOfBuffer", { bg = "none" })
EOF

colorscheme tokyonight


" LSP
lua << EOF 
vim.lsp.config("clangd", {
  cmd = { "clangd", "--fallback-style=Google" },
  })
vim.lsp.enable("clangd")
vim.lsp.enable("pyright")
vim.lsp.enable("html")
vim.lsp.enable("cssls")
vim.lsp.enable("ts_ls")
vim.lsp.enable("bashls")
vim.lsp.enable("jsonls")
vim.lsp.enable("marksman")
vim.lsp.enable("vimls")
vim.lsp.enable("lua_ls")

-- Format on save using LSP
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function()
    vim.lsp.buf.format({ async = false })
  end,
})
EOF

" Format using LSP
nnoremap <leader>f :lua vim.lsp.buf.format()<CR>


" MASON
lua << EOF
require("mason").setup({
  ui = {
    icons = {
      package_installed = "✓",
      package_pending = "➜",
      package_uninstalled = "✗"
    }
  }
})
EOF


" CMP
lua << EOF
local cmp = require'cmp'

cmp.setup({
  window = {
    completion = cmp.config.window.bordered(),
    documentation = cmp.config.window.bordered(),
  },
  mapping = cmp.mapping.preset.insert({ ['<C-b>'] = cmp.mapping.scroll_docs(-4), ['<C-f>'] = cmp.mapping.scroll_docs(4), ['<C-Space>'] = cmp.mapping.complete(),
		['<Tab>'] = cmp.mapping.select_next_item(),
    ['<S-Tab>'] = cmp.mapping.select_prev_item(),
    ['<Esc>'] = cmp.mapping.close(),
    ['<C-e>'] = cmp.mapping.abort(),
    ['<CR>'] = cmp.mapping.confirm({ select = true }),
  }),
  sources = cmp.config.sources({
    { name = 'nvim_lsp' },
  }, {
    { name = 'buffer' },
  })
})
EOF


" HOVER NVIM
lua << EOF
require("hover").setup {
  init = function()
    -- Require providers
    require("hover.providers.lsp")
    require('hover.providers.gh')
    require('hover.providers.gh_user')
    require('hover.providers.dap')
    require('hover.providers.diagnostic')
    require('hover.providers.man')
    require('hover.providers.dictionary')
  end,
  preview_opts = {
    border = 'rounded'
  },
  -- Whether the contents of a currently open hover window should be moved
  -- to a :h preview-window when pressing the hover keymap.
  preview_window = false,
  title = true,
  mouse_providers = {
    'LSP'
  },
  mouse_delay = 000
}
EOF


" GITSIGNS
lua << EOF
require('gitsigns').setup {
  signs = {
    add          = { text = '┃' },
    change       = { text = '┃' },
    delete       = { text = '_' },
    topdelete    = { text = '‾' },
    changedelete = { text = '~' },
    untracked    = { text = '┆' },
  },
  signs_staged = {
    add          = { text = '┃' },
    change       = { text = '┃' },
    delete       = { text = '_' },
    topdelete    = { text = '‾' },
    changedelete = { text = '~' },
    untracked    = { text = '┆' },
  },
  signs_staged_enable = true,
  signcolumn = true,  -- Toggle with `:Gitsigns toggle_signs`
  numhl      = false, -- Toggle with `:Gitsigns toggle_numhl`
  linehl     = false, -- Toggle with `:Gitsigns toggle_linehl`
  word_diff  = false, -- Toggle with `:Gitsigns toggle_word_diff`
  watch_gitdir = {
    follow_files = true
  },
  auto_attach = true,
  attach_to_untracked = false,
  current_line_blame = false, -- Toggle with `:Gitsigns toggle_current_line_blame`
  current_line_blame_opts = {
    virt_text = true,
    virt_text_pos = 'eol', -- 'eol' | 'overlay' | 'right_align'
    delay = 1000,
    ignore_whitespace = false,
    virt_text_priority = 100,
    use_focus = true,
  },
  current_line_blame_formatter = '<author>, <author_time:%R> - <summary>',
  sign_priority = 6,
  update_debounce = 100,
  status_formatter = nil, -- Use default
  max_file_length = 40000, -- Disable if file is longer than this (in lines)
  preview_config = {
    -- Options passed to nvim_open_win
    style = 'minimal',
    relative = 'cursor',
    row = 0,
    col = 1
  },
}
EOF


" INDENT-BLACKLINE
lua << EOF
require("ibl").setup {
  indent = { char = "│" },
  scope = { show_start = false, show_end = false }
}
EOF


" HARPOON
nnoremap <leader>a :lua require("harpoon.mark").add_file()<CR>
nnoremap <leader>e :lua require("harpoon.ui").toggle_quick_menu()<CR>
nnoremap <leader>1 :lua require("harpoon.ui").nav_file(1)<CR>
nnoremap <leader>2 :lua require("harpoon.ui").nav_file(2)<CR>
nnoremap <leader>3 :lua require("harpoon.ui").nav_file(3)<CR>
nnoremap <leader>4 :lua require("harpoon.ui").nav_file(4)<CR>


" UNDOTREE
let g:undotree_SetFocusWhenToggle = 1
nnoremap <leader>u :UndotreeToggle<CR>


" RENDER MARKDOWN
autocmd BufReadPost *.md :RenderMarkdown


" NVIM BISCUITS
lua <<EOF
require("nvim-biscuits").setup({
  default_config = {
    max_length = 50,
    min_distance = 5,
    prefix_string = " ⤷ ",
  },
  cursor_line_only = true,
})
EOF


" COPILOT CHAT
lua << EOF
require("CopilotChat").setup {
  window = {
    layout = 'vertical', -- 'vertical', 'horizontal', 'float', 'replace', or a function that returns the layout
    width = 0.3, -- fractional width of parent, or absolute width in columns when > 1
    height = 0.5, -- fractional height of parent, or absolute height in rows when > 1
    -- Options below only apply to floating windows
    relative = 'win', -- 'editor', 'win', 'cursor', 'mouse'
    border = 'single', -- 'none', single', 'double', 'rounded', 'solid', 'shadow'
    row = nil, -- row position of the window, default is centered
    col = nil, -- column position of the window, default is centered
    title = 'Copilot Chat', -- title of chat window
    footer = nil, -- footer of chat window
    zindex = 1, -- determines if window is on top or below other floating windows
  },
  prompts = {
  Explain = {
    prompt = 'Write an explanation for the selected code as paragraphs of text.',
    system_prompt = 'COPILOT_EXPLAIN',
  },
  Review = {
    prompt = 'Review the selected code.',
    system_prompt = 'COPILOT_REVIEW',
  },
  Fix = {
    prompt = 'There is a problem in this code. Identify the issues and rewrite the code with fixes. Explain what was wrong and how your changes address the problems.',
  },
  Optimize = {
    prompt = 'Optimize the selected code to improve performance and readability. Explain your optimization strategy and the benefits of your changes.',
  },
  Docs = {
    prompt = 'Please add documentation comments to the selected code.',
  },
  Tests = {
    prompt = 'Please generate tests for my code.',
  },
  Commit = {
    prompt = 'Write commit message for the change with commitizen convention. Keep the title under 50 characters and wrap message at 72 characters. Format as a gitcommit code block.',
    context = 'git:staged',
  },
  },
}
EOF


" OBSIDIAN NVIM
autocmd BufRead,BufNewFile ~/01-studio/02-obsidian/*/*.md setlocal conceallevel=2
nnoremap <leader>op :lua require("obsidianPreview").preview_link()<CR>
nnoremap <leader>ot :ObsidianTemplate<CR>
nnoremap <leader>ol :ObsidianFollowLink<CR>
nnoremap <leader>on :ObsidianNew<CR>

lua << EOF
require("obsidian").setup({
  workspaces = {
    {
      name = "gaitanos-mind",
      path = "~/01-studio/02-obsidian/gaitanos-mind",
    },
  },
  completion = {
    nvim_cmp = true,
    min_chars = 2,
  },
  templates = {
    folder = "Templates", -- das ist der Directory inside mein vault
    date_format = "%a %d %B %Y",
    time_format = "%H:%M",
  },
  attachments = {
    img_folder = "~/01-studio/02-obsidian/gaitanos-mind/Media/",
  },
  new_notes_location = "~/01-studio/02-obsidian/gaitanos-mind/01-fleeting/",
})

local vault_root = os.getenv("HOME") .. "/01-studio/02-obsidian/gaitanos-mind"
local media_folder = vault_root .. "/Media"

local function open_image_vsplit()
  local line = vim.api.nvim_get_current_line()
  local link = line:match("!%[%[(.+)%]%]")

  if not link then
    print("No image link under cursor")
    return
  end

  -- expand ~
  link = link:gsub("^~", os.getenv("HOME"))

  -- try vault root first
  local full_path = vault_root .. "/" .. link

  -- if not found, try Media/
  if vim.fn.filereadable(full_path) == 0 then
    full_path = media_folder .. "/" .. link
  end

  -- still not found? give up
  if vim.fn.filereadable(full_path) == 0 then
    print("Image not found: " .. full_path)
    return
  end

  vim.cmd("leftabove vsplit")
  vim.cmd("edit " .. full_path)
end

vim.keymap.set("n", "<leader>io", open_image_vsplit, { desc = "Open image in vsplit" })

EOF


" ZEN MODE
nnoremap <leader>z :lua require("zen-mode").toggle()<CR>

lua << EOF
require("zen-mode").setup({
  window = {
    width = .5
  },
  plugins = {
    options = {
      enabled = true,
      ruler = false, -- disables the ruler text in the cmd line area
      showcmd = false, -- disables the command in the last line of the screen
      laststatus = 0, -- turn off the statusline in zen mode
    },
    twilight = { enabled = false },
    gitsigns = { enabled = false },
    tmux = { enabled = false },
    todo = { enabled = false },
    kitty = {
      enabled = false,
      font = "+5",
    },
  }
})
EOF


" TWILIGHT
nnoremap <leader>t :lua require("twilight").toggle()<CR>

lua << EOF
require("twilight").setup({
  dimming = {
    alpha = 0.50,
    color = { "Normal", "#ffffff" }, -- fallback color
  },
  context = 20,
  treesitter = true, -- use Treesitter when available
  expand = {
    "function",
    "method",
    "table",
    "if_statement",
  },
  exclude = {},
})
EOF


" TODO COMMENTS
lua << EOF
require("todo-comments").setup {
  signs = true,
  sign_priority = 8,
  keywords = {
    FIX = {
      icon = " ",
      color = "error",
      alt = { "FIXME", "BUG", "FIXIT", "ISSUE" },
    },
    TODO = { icon = " ", color = "info" },
    HACK = { icon = " ", color = "warning" },
    WARN = { icon = " ", color = "warning", alt = { "WARNING", "XXX" } },
    PERF = { icon = " ", alt = { "OPTIM", "PERFORMANCE", "OPTIMIZE" } },
    NOTE = { icon = " ", color = "hint", alt = { "INFO" } },
    TEST = { icon = "⏲ ", color = "test", alt = { "TESTING", "PASSED", "FAILED" } },
  },
  gui_style = {
    fg = "NONE",
    bg = "BOLD",
  },
  merge_keywords = true,
  highlight = {
    multiline = true,
    multiline_pattern = "^.",
    multiline_context = 10,
    before = "",
    keyword = "wide",
    after = "fg",
    pattern = [[.*<(KEYWORDS)\s*:]],
    comments_only = true,
    max_line_len = 400,
    exclude = {},
  },
  colors = {
    error = { "DiagnosticError", "ErrorMsg", "#DC2626" },
    warning = { "DiagnosticWarn", "WarningMsg", "#FBBF24" },
    info = { "DiagnosticInfo", "#2563EB" },
    hint = { "DiagnosticHint", "#10B981" },
    default = { "Identifier", "#7C3AED" },
    test = { "Identifier", "#FF00FF" },
  },
  search = {
    command = "rg",
    args = {
      "--color=never",
      "--no-heading",
      "--with-filename",
      "--line-number",
      "--column",
    },
    pattern = [[\b(KEYWORDS):]],
  },
}
EOF



" TS AUTOTAG
lua << EOF
require('nvim-ts-autotag').setup()
EOF



lua << EOF
require("image").setup({
  backend = "kitty",
  processor = "magick_cli", -- or "magick_rock"
  integrations = {
    markdown = {
      enabled = true,
      clear_in_insert_mode = false,
      download_remote_images = true,
      only_render_image_at_cursor = false,
      only_render_image_at_cursor_mode = "popup",
      floating_windows = false, -- if true, images will be rendered in floating markdown windows
      filetypes = { "markdown", "vimwiki" }, -- markdown extensions (ie. quarto) can go here
    },
    neorg = {
      enabled = true,
      filetypes = { "norg" },
    },
    typst = {
      enabled = true,
      filetypes = { "typst" },
    },
    html = {
      enabled = false,
    },
    css = {
      enabled = false,
    },
  },
  max_width = nil,
  max_height = nil,
  max_width_window_percentage = nil,
  max_height_window_percentage = 50,
  window_overlap_clear_enabled = false, -- toggles images when windows are overlapped
  window_overlap_clear_ft_ignore = { "cmp_menu", "cmp_docs", "snacks_notif", "scrollview", "scrollview_sign" },
  editor_only_render_when_focused = false, -- auto show/hide images when the editor gains/looses focus
  tmux_show_only_in_active_window = false, -- auto show/hide images in the correct Tmux window (needs visual-activity off)
  hijack_file_patterns = { "*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.avif" }, -- render image files as images when opened
})
EOF


lua << EOF
require("diagram").setup({
  integrations = {
    require("diagram.integrations.markdown"),
    require("diagram.integrations.neorg"),
  },
  renderer_options = {
    mermaid = {
      theme = "forest",
    },
    plantuml = {
      charset = "utf-8",
    },
    d2 = {
      theme_id = 1,
    },
    gnuplot = {
      theme = "dark",
      size = "800,600",
    },
  },
})
EOF


" LAB NVIM
lua << EOF
require('lab').setup {
  code_runner = {
    enabled = true,
  },
  quick_data = {
    enabled = true,
  }
}
EOF


" NVIM-NOTIFY
lua << EOF
vim.schedule(function()
  require("notify").setup({
    stages = "fade_in_slide_out",
    timeout = 3000,
  })
  vim.notify = require("notify")
end)
EOF


" NVIM-NOTIFY SETUP
lua << EOF
require("notify").setup({
  background_colour = "#000000",
  stages = "fade_in_slide_out",
  timeout = 3000,
})
vim.notify = require("notify")
EOF


" CSVVIEW
lua << EOF
require('csvview').setup({
  parser = {
    --- The number of lines that the asynchronous parser processes per cycle.
    --- This setting is used to prevent monopolization of the main thread when displaying large files.
    --- If the UI freezes, try reducing this value.
    --- @type integer
    async_chunksize = 50,

    --- Specifies the delimiter character to separate columns.
    --- This can be configured in one of three ways:
    ---
    --- 1. As a single string for a fixed delimiter.
    ---    e.g., delimiter = ","
    ---
    --- 2. As a function that dynamically returns the delimiter.
    ---    e.g., delimiter = function(bufnr) return "\t" end
    ---
    --- 3. As a table for advanced configuration:
    ---    - `ft`: Maps filetypes to specific delimiters. This has the highest priority.
    ---    - `fallbacks`: An ordered list of delimiters to try for automatic detection
    ---      when no `ft` rule matches. The plugin will test them in sequence and use
    ---      the first one that highest scores based on the number of fields in each line.
    ---
    --- Note: Only fixed-length strings are supported as delimiters.
    --- Regular expressions (e.g., `\s+`) are not currently supported.
    --- @type CsvView.Options.Parser.Delimiter
    delimiter = {
      ft = {
        csv = ",",
        tsv = "\t",
      },
      fallbacks = {
        ",",
        "\t",
        ";",
        "|",
        ":",
        " ",
      },
    },

    --- The quote character
    --- If a field is enclosed in this character, it is treated as a single field and the delimiter in it will be ignored.
    --- e.g:
    ---  quote_char= "'"
    --- You can also specify it on the command line.
    --- e.g:
    --- :CsvViewEnable quote_char='
    --- @type string
    quote_char = '"',

    --- The comment prefix characters
    --- If the line starts with one of these characters, it is treated as a comment.
    --- Comment lines are not displayed in tabular format.
    --- You can also specify it on the command line.
    --- e.g:
    --- :CsvViewEnable comment=#
    --- @type string[]
    comments = {
      -- "#",
      -- "--",
      -- "//",
    },

    --- Maximum lookahead for multi-line fields
    --- This limits how many lines ahead the parser will look when trying to find 
    --- the closing quote of a multi-line field. Setting this too high may cause
    --- performance issues when editing files with unmatched quotes.
    --- @type integer
    max_lookahead = 50,
  },
  view = {
    --- minimum width of a column
    --- @type integer
    min_column_width = 5,

    --- spacing between columns
    --- @type integer
    spacing = 2,

    --- The display method of the delimiter
    --- "highlight" highlights the delimiter
    --- "border" displays the delimiter with `│`
    --- You can also specify it on the command line.
    --- e.g:
    --- :CsvViewEnable display_mode=border
    ---@type CsvView.Options.View.DisplayMode
    display_mode = "highlight",

    --- The line number of the header row
    --- Controls which line should be treated as the header for the CSV table.
    --- This affects both visual styling and the sticky header feature.
    ---
    --- Values:
    --- - `true`: Automatically detect the header line (default)
    --- - `integer`: Specific line number to use as header (1-based)
    --- - `false`: No header line, treat all lines as data rows
    ---
    --- When a header is defined, it will be:
    --- - Highlighted with the CsvViewHeaderLine highlight group
    --- - Used for the sticky header feature if enabled
    --- - Excluded from normal data processing in some contexts
    ---
    --- See also: `view.sticky_header`
    --- @type integer|false|true
    header_lnum = true,

    --- The sticky header feature settings
    --- If `view.header_lnum` is set, the header line is displayed at the top of the window.
    sticky_header = {
      --- Whether to enable the sticky header feature
      --- @type boolean
      enabled = true,

      --- The separator character for the sticky header window
      --- set `false` to disable the separator
      --- @type string|false
      separator = "─",
    },
  },

  --- Keymaps for csvview.
  --- These mappings are only active when csvview is enabled.
  --- You can assign key mappings to each action defined in `opts.actions`.
  --- For example:
  --- ```lua
  --- keymaps = {
  ---   -- Text objects for selecting fields
  ---   textobject_field_inner = { "if", mode = { "o", "x" } },
  ---   textobject_field_outer = { "af", mode = { "o", "x" } },
  ---
  ---   -- Excel-like navigation:
  ---   -- Use <Tab> and <S-Tab> to move horizontally between fields.
  ---   -- Use <Enter> and <S-Enter> to move vertically between rows.
  ---   -- Note: In terminals, you may need to enable CSI-u mode to use <S-Tab> and <S-Enter>.
  ---   jump_next_field_end = { "<Tab>", mode = { "n", "v" } },
  ---   jump_prev_field_end = { "<S-Tab>", mode = { "n", "v" } },
  ---   jump_next_row = { "<Enter>", mode = { "n", "v" } },
  ---   jump_prev_row = { "<S-Enter>", mode = { "n", "v" } },
  ---
  ---   -- Custom key mapping example:
  ---   { "<leader>h", function() print("hello") end, mode = "n" },
  --- }
  --- ```
  --- @type CsvView.Options.Keymaps
  keymaps = {},

  --- Actions for keymaps.
  ---@type CsvView.Options.Actions
  actions = {
    -- See lua/csvview/config.lua
  },
})
EOF
