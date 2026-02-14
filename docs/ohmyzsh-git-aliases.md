# Oh My Zsh Git Aliases

## Basics

| Alias | Command |
|-------|---------|
| `g` | `git` |
| `gst` | `git status` |
| `gss` | `git status --short` |
| `gsb` | `git status --short --branch` |

## Diff

| Alias | Command |
|-------|---------|
| `gd` | `git diff` |
| `gds` | `git diff --staged` |
| `gdca` | `git diff --cached` |
| `gdcw` | `git diff --cached --word-diff` |
| `gdw` | `git diff --word-diff` |
| `gdup` | `git diff @{upstream}` |
| `gdt` | `git diff-tree --no-commit-id --name-only -r` |

## Adding

| Alias | Command |
|-------|---------|
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gau` | `git add --update` |
| `gav` | `git add --verbose` |
| `gapa` | `git add --patch` |

## Committing

| Alias | Command |
|-------|---------|
| `gc` | `git commit --verbose` |
| `gc!` | `git commit --verbose --amend` |
| `gca` | `git commit --verbose --all` |
| `gca!` | `git commit --verbose --all --amend` |
| `gcam` | `git commit --all --message` |
| `gcmsg` | `git commit --message` |
| `gcan!` | `git commit --verbose --all --no-edit --amend` |
| `gcann!` | `git commit --verbose --all --date=now --no-edit --amend` |
| `gcans!` | `git commit --verbose --all --signoff --no-edit --amend` |
| `gcas` | `git commit --all --signoff` |
| `gcasm` | `git commit --all --signoff --message` |
| `gcn!` | `git commit --verbose --no-edit --amend` |
| `gcs` | `git commit --gpg-sign` |
| `gcsm` | `git commit --signoff --message` |
| `gcss` | `git commit --gpg-sign --signoff` |
| `gcssm` | `git commit --gpg-sign --signoff --message` |

## Branching

| Alias | Command |
|-------|---------|
| `gb` | `git branch` |
| `gba` | `git branch --all` |
| `gbd` | `git branch --delete` |
| `gbD` | `git branch --delete --force` |
| `gbm` | `git branch --move` |
| `gbnm` | `git branch --no-merged` |
| `gbr` | `git branch --remote` |
| `gbg` | List branches with gone upstream |
| `gbgd` | Delete local branches with gone upstream |
| `gbgD` | Force delete local branches with gone upstream |

## Checkout & Switch

| Alias | Command |
|-------|---------|
| `gco` | `git checkout` |
| `gcb` | `git checkout -b` |
| `gcB` | `git checkout -B` |
| `gcm` | `git checkout $(git_main_branch)` |
| `gcd` | `git checkout $(git_develop_branch)` |
| `gcor` | `git checkout --recurse-submodules` |
| `gsw` | `git switch` |
| `gswc` | `git switch --create` |
| `gswd` | `git switch $(git_develop_branch)` |
| `gswm` | `git switch $(git_main_branch)` |

## Push

| Alias | Command |
|-------|---------|
| `gp` | `git push` |
| `gpv` | `git push --verbose` |
| `gpd` | `git push --dry-run` |
| `gpf` | `git push --force-with-lease --force-if-includes` |
| `gpf!` | `git push --force` |
| `gpsup` | `git push --set-upstream origin $(current_branch)` |
| `gpsupf` | `git push --set-upstream origin $(current_branch) --force-with-lease` |
| `ggpush` | `git push origin $(current_branch)` |
| `gpu` | `git push upstream` |
| `gpoat` | `git push origin --all && git push origin --tags` |
| `gpod` | `git push origin --delete` |

## Pull

| Alias | Command |
|-------|---------|
| `gl` | `git pull` |
| `ggpull` | `git pull origin $(current_branch)` |
| `gpr` | `git pull --rebase` |
| `gpra` | `git pull --rebase --autostash` |
| `gprav` | `git pull --rebase --autostash -v` |
| `gprv` | `git pull --rebase -v` |
| `gprom` | `git pull --rebase origin $(git_main_branch)` |
| `gpromi` | `git pull --rebase=interactive origin $(git_main_branch)` |
| `gluc` | `git pull upstream $(current_branch)` |
| `glum` | `git pull upstream $(git_main_branch)` |

## Fetch

| Alias | Command |
|-------|---------|
| `gf` | `git fetch` |
| `gfo` | `git fetch origin` |
| `gfa` | `git fetch --all --prune --jobs=10` |

## Log

| Alias | Command |
|-------|---------|
| `glo` | `git log --oneline --decorate` |
| `glog` | `git log --oneline --decorate --graph` |
| `gloga` | `git log --oneline --decorate --graph --all` |
| `glg` | `git log --stat` |
| `glgg` | `git log --graph` |
| `glgga` | `git log --graph --decorate --all` |
| `glgm` | `git log --graph --max-count=10` |
| `glgp` | `git log --stat --patch` |
| `glol` | `git log --graph --pretty` (colored, relative date) |
| `glola` | `git log --graph --pretty --all` (colored, relative date) |
| `glols` | `git log --graph --pretty --stat` (colored, relative date) |
| `glod` | `git log --graph --pretty` (colored, absolute date) |
| `glods` | `git log --graph --pretty --date=short` (colored) |
| `gcount` | `git shortlog --summary --numbered` |

## Stash

| Alias | Command |
|-------|---------|
| `gsta` | `git stash push` |
| `gstu` | `git stash push --include-untracked` |
| `gstaa` | `git stash apply` |
| `gstp` | `git stash pop` |
| `gstl` | `git stash list` |
| `gstd` | `git stash drop` |
| `gstc` | `git stash clear` |
| `gsts` | `git stash show --patch` |
| `gstall` | `git stash --all` |

## Rebase

| Alias | Command |
|-------|---------|
| `grb` | `git rebase` |
| `grbi` | `git rebase --interactive` |
| `grbm` | `git rebase $(git_main_branch)` |
| `grbd` | `git rebase $(git_develop_branch)` |
| `grbom` | `git rebase origin/$(git_main_branch)` |
| `grbo` | `git rebase --onto` |
| `grba` | `git rebase --abort` |
| `grbc` | `git rebase --continue` |
| `grbs` | `git rebase --skip` |

## Merge

| Alias | Command |
|-------|---------|
| `gm` | `git merge` |
| `gma` | `git merge --abort` |
| `gms` | `git merge --squash` |
| `gmom` | `git merge origin/$(git_main_branch)` |
| `gmum` | `git merge upstream/$(git_main_branch)` |
| `gmtl` | `git mergetool --no-prompt` |
| `gmtlvim` | `git mergetool --no-prompt --tool=vimdiff` |

## Reset & Restore

| Alias | Command |
|-------|---------|
| `grh` | `git reset` |
| `grhh` | `git reset --hard` |
| `grhk` | `git reset --keep` |
| `grhs` | `git reset --soft` |
| `groh` | `git reset origin/$(current_branch) --hard` |
| `gru` | `git reset --` |
| `grs` | `git restore` |
| `grss` | `git restore --source` |
| `grst` | `git restore --staged` |
| `gpristine` | `git reset --hard && git clean --force -dfx` |

## Cherry-Pick

| Alias | Command |
|-------|---------|
| `gcp` | `git cherry-pick` |
| `gcpa` | `git cherry-pick --abort` |
| `gcpc` | `git cherry-pick --continue` |

## Revert

| Alias | Command |
|-------|---------|
| `grev` | `git revert` |
| `greva` | `git revert --abort` |
| `grevc` | `git revert --continue` |

## Remote

| Alias | Command |
|-------|---------|
| `gr` | `git remote` |
| `gra` | `git remote add` |
| `grmv` | `git remote rename` |
| `grrm` | `git remote remove` |
| `grset` | `git remote set-url` |
| `grv` | `git remote --verbose` |
| `grup` | `git remote update` |

## Tags

| Alias | Command |
|-------|---------|
| `gta` | `git tag --annotate` |
| `gts` | `git tag --sign` |
| `gtv` | `git tag \| sort -V` |
| `gtl` | `git tag --sort=-v:refname -n --list` |
| `gdct` | `git describe --tags $(git rev-list --tags --max-count=1)` |

## Show & Blame

| Alias | Command |
|-------|---------|
| `gsh` | `git show` |
| `gsps` | `git show --pretty=short --show-signature` |
| `gbl` | `git blame -w` |

## Bisect

| Alias | Command |
|-------|---------|
| `gbs` | `git bisect` |
| `gbss` | `git bisect start` |
| `gbsb` | `git bisect bad` |
| `gbsg` | `git bisect good` |
| `gbsn` | `git bisect new` |
| `gbso` | `git bisect old` |
| `gbsr` | `git bisect reset` |

## Apply & AM

| Alias | Command |
|-------|---------|
| `gap` | `git apply` |
| `gapt` | `git apply --3way` |
| `gam` | `git am` |
| `gama` | `git am --abort` |
| `gamc` | `git am --continue` |
| `gams` | `git am --skip` |
| `gamscp` | `git am --show-current-patch` |

## Submodules

| Alias | Command |
|-------|---------|
| `gsi` | `git submodule init` |
| `gsu` | `git submodule update` |

## Worktree

| Alias | Command |
|-------|---------|
| `gwt` | `git worktree` |
| `gwta` | `git worktree add` |
| `gwtls` | `git worktree list` |
| `gwtmv` | `git worktree move` |
| `gwtrm` | `git worktree remove` |

## Clone & Config

| Alias | Command |
|-------|---------|
| `gcl` | `git clone --recurse-submodules` |
| `gcf` | `git config --list` |

## Remove

| Alias | Command |
|-------|---------|
| `grm` | `git rm` |
| `grmc` | `git rm --cached` |

## Ignore / Unignore

| Alias | Command |
|-------|---------|
| `gignore` | `git update-index --assume-unchanged` |
| `gunignore` | `git update-index --no-assume-unchanged` |
| `gignored` | List assumed-unchanged files |

## Misc

| Alias | Command |
|-------|---------|
| `grt` | `cd` to git repo root |
| `gfg` | `git ls-files \| grep` |
| `ghh` | `git help` |
| `gclean` | `git clean --interactive -d` |
| `gwch` | `git whatchanged -p --abbrev-commit --pretty=medium` |
| `gwip` | Stage all + WIP commit (skips hooks) |
| `gunwip` | Undo a WIP commit |
| `grf` | `git reflog` |
| `gk` | `gitk --all --branches` |
| `gke` | `gitk --all` (including reflogs) |
| `gg` | `git gui citool` |
| `gga` | `git gui citool --amend` |
| `ggsup` | `git branch --set-upstream-to=origin/$(current_branch)` |

## Deprecated (redirects)

| Old Alias | Use Instead |
|-----------|-------------|
| `gup` | `gpr` |
| `gupa` | `gpra` |
| `gupav` | `gprav` |
| `gupom` | `gprom` |
| `gupomi` | `gpromi` |
| `gupv` | `gprv` |
