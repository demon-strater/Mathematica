# Project workflow preferences

- After each requested change, make the updated version available on the active preview and verify that an ordinary refresh serves it. Bump the query version in `index.html` for each modified CSS or JavaScript asset.
- Keep completed change sets in local Git commits so the user can undo them. Record the prior commit before starting edits; preserve unrelated working changes.
- When the user asks to cancel or undo, revert the latest relevant change set, preserve unrelated work, and bump affected asset versions again so the restored design is visible after refreshing. Do not use a destructive reset or force-push.
- For this round of design changes, the original baseline is `b8bf2c10ba37d3fc74f43f8c1e7931ac94cc4aaa`.
- The existing public deployment is GitHub Pages from `demon-strater/Mathematica`, `main`, repository root, at `https://demon-strater.github.io/Mathematica/`. Local preview and public deployment are separate: report which one was updated. Public pushes still require the user's explicit authorization of the destination and changes following the prior automatic approval rejection.
- Verify deployment completion before describing the public site as updated. Keep public rollback history with revert commits.
