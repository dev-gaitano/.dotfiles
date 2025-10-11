~/.scripts/pywal.sh
echo " "

# Tmux startup script
if [[ -z "$TMUX" ]]; then
	~/.scripts/startUp	
fi

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH

# Path to your Oh My Zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time Oh My Zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="powerlevel10k/powerlevel10k"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
source ~/.oh-my-zsh/custom/themes/powerlevel10k/powerlevel10k.zsh-theme

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
# zstyle ':omz:update' mode reminder  # just remind me to update when it's time

# Uncomment the following line to change how often to auto-update (in days).
zstyle ':omz:update' frequency 13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# You can also set it to another string to have that shown instead of the default red dots.
# e.g. COMPLETION_WAITING_DOTS="%F{yellow}waiting...%f"
# Caution: this setting can cause issues with multiline prompts in zsh < 5.7.1 (see #5765)
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8


# Preferred editor for local and remote sessions
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='nvim'
else
  export EDITOR='nvim'
fi

export EDITOR=nvim
export VISUAL=nvim


# Compilation flags
# export ARCHFLAGS="-arch $(uname -m)"


# ALIASES
# For a full list of active aliases, run `alias`.
# Oh My Zsh users are encouraged to define aliases within a top-level file
# in the $ZSH_CUSTOM folder, with .zsh extension.
# Configs
alias zshconf="nvim ~/.zshrc"
alias ohmyzsh="nvim ~/.oh-my-zsh"
alias vimconf="nvim ~/.vimrc"
alias nvimconf="nvim ~/.config/nvim/init.vim"
alias tmuxconf="nvim ~/.tmux.conf"
alias gitconf="nvim ~/.gitconfig"
alias bashconf="nvim ~/.bashrc"
alias i3conf="nvim ~/.config/i3/config"
alias polybarconf="nvim ~/.config/polybar/config.ini"
alias rangerconf="nvim ~/.config/ranger/rc.conf"
alias neofetchconf="nvim ~/.config/neofetch/config.conf"
alias kittyconf="nvim ~/.config/kitty/kitty.conf"
alias picomconf="nvim ~/.config/picom/picom.conf"
alias dunstconf="nvim ~/.config/dunst/dunstrc"

# Programs
alias browser="firefox"
alias ra="ranger"

# Scripts
export PATH="$HOME/gaitano/.scripts:$PATH"

alias scripts="nvim ~/.scripts/"
alias tmuc="~/.scripts/tmuxCreate"
alias pywal="~/.scripts/pywal.sh"
alias hdmi="~/.scripts/hdmi-connect.sh"
alias nvimUpdate="~/.scripts/neovimUpdate.sh"
alias schrofer="~/.scripts/schroferStart.sh"

# Custom Aliases
# git
alias gs="git status"
alias gd="git diff"
alias gds="git diff --staged"
alias ga="git add"
alias gap="git add -p"
alias gr="git reset"
alias gc="git commit"
alias gp="git push"
alias gu="git pull"
alias gl="git log --graph --decorate --all"
alias glo="git log --oneline --graph --decorate --all"
alias gco="git checkout"
alias gb="git branch"
alias gi="git init"
alias gcl="git clone"

# tmux
alias ta="tmux attach"
alias tl="tmux list-sessions"
alias tn="tmux new-session -s"
alias tks="tmux kill server"

#hledger
export HLEDGER_CASHFLOW_RULES=~/01-studio/03-finance/cashflow.rules
export LEDGER_FILE=~/01-studio/03-finance/2025.journal

alias hla="hledger add"
alias hlb="hledger balance"
alias hlp="hledger print"
alias ledger="nvim $LEDGER_FILE"

# Obsidian CLI
alias obsdnOpen="nvim ~/01-studio/02-obsidian/gaitanos-mind"
alias obsdn="cd ~/01-studio/02-obsidian/gaitanos-mind"
alias obsdn1="cd ~/01-studio/02-obsidian/gaitanos-mind/01-fleeting"
alias obsdn2="cd ~/01-studio/02-obsidian/gaitanos-mind/02-literature"
alias obsdn3="cd ~/01-studio/02-obsidian/gaitanos-mind/03-permanent"
alias obsdn4="cd ~/01-studio/02-obsidian/gaitanos-mind/04-MOCs"


# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion


# batcat
export MANPAGER="sh -c 'col -bx | batcat -l man'"
export MANROFFOPT="-c"


# FZF
source <(fzf --zsh)

export FZF_DEFAULT_COMMAND='rg --files --hidden'
export FZF_DEFAULT_OPTS="--style full --height 100% --preview 'batcat --color=always {}' --layout=reverse --bind 'focus:transform-header:file --brief {}'"


# zoxide
eval "$(zoxide init zsh)"


# pyenv & pipx
export PATH="$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"

# Created by `pipx` on 2025-03-06 13:03:30
export PATH="$PATH:/home/gaitano/.local/bin"


setopt CORRECT
setxkbmap -option compose:ralt
