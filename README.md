# PR Risk Analyzer Demo Repository

This repository is a controlled testing environment designed to showcase and test a PR Risk Analyzer system. It simulates various code change scenarios, each representing a different pull request risk level.

## Project Structure

- `src/auth/`: Core authentication logic (AuthService).
- `src/payment/`: Core checkout logic (Checkout).
- `src/config/`: Application configuration file (AppConfig).
- `src/utils/`: Utility helper functions.
- `tests/`: Baseline unit tests for all modules.
- `scripts/`: Helper scripts for generating test scenarios.

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Run baseline tests**:
    ```bash
    npm test
    ```

---

## Demo Scenarios

### Scenario 1: LOW Risk 🟢
**Goal**: Demonstrate a safe PR with minimal changes.

1.  Open `src/utils/helper.js`.
2.  Add a new small utility function (e.g., `isStringEmpty`).
3.  Update `tests/auth.test.js` or a new test file to include a test for it.
4.  **Expected Analyzer Output**: `LOW RISK`. Small diff, no core modules touched, tests added.

### Scenario 2: MEDIUM Risk 🟡
**Goal**: Demonstrate a moderate refactor.

1.  Modify 5–8 files (e.g., add comments, rename internal variables, update formatting).
2.  Ensure no changes are made to `auth/` or `payment/`.
3.  **Expected Analyzer Output**: `MEDIUM RISK`. Moderate diff (~150-250 lines), but no critical modules affected.

### Scenario 3: HIGH Risk 🔴
**Goal**: Demonstrate a dangerous PR with large changes to core logic.

1.  Run the helper script to generate a large diff:
    ```bash
    npm run generate-diff src/auth/auth.service.js src/auth/auth.service.js 15
    ```
    This will append 300+ lines of code to the authentication service.
2.  Modify `src/payment/checkout.js` and `src/config/app.config.js`.
3.  Delete or skip existing tests in `tests/auth.test.js`.
4.  **Expected Analyzer Output**: `HIGH RISK`. Large diff (>300 lines), sensitive modules modified, tests removed.

### Scenario 4: Risk Reduction (Key Demo) 🔄
**Goal**: Demonstrate how to transition from HIGH to MEDIUM/LOW.

1.  **Step 1 (Start as HIGH)**: Follow Scenario 3 instructions.
2.  **Step 2 (Reduce Risk)**: 
    - Revert changes to `src/config/app.config.js`.
    - Reduce the diff size (remove duplicated blocks from `auth.service.js`).
    - Restore and add new, robust tests.
3.  **Expected Analyzer Output**: Risk level transitions from `HIGH` → `MEDIUM` → `LOW`.

---

## Helper Script

The `scripts/generate-diff.js` script allows you to quickly create large files:

```bash
node scripts/generate-diff.js <input_file> <output_file> <repetitions>
```

Example:
```bash
node scripts/generate-diff.js src/utils/helper.js src/utils/helper.js 100
```
This will add 100 duplicated blocks (~1000 lines) to the helper file.
