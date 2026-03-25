# Quick Start: Complex Dialog Component

## Prerequisites

1. **Install Spartan UI CLI and dependencies:**

   ```bash
   npm i -D @spartan-ng/cli
   npm i @angular/cdk
   ```

2. **Setup Tailwind with Spartan preset:**

   ```javascript
   // tailwind.config.js
   module.exports = {
     presets: [require("@spartan-ng/brain/hlm-tailwind-preset")],
     content: ["./src/**/*.{html,ts}"],
     theme: { extend: {} },
     plugins: [],
   };
   ```

3. **Add CSS variables:**

   ```bash
   ng g @spartan-ng/cli:ui-theme
   ```

4. **Install dialog components:**
   ```bash
   ng g @spartan-ng/cli:ui dialog
   ng g @spartan-ng/cli:ui button
   ng g @spartan-ng/cli:ui input
   ng g @spartan-ng/cli:ui label
   ng g @spartan-ng/cli:ui textarea
   ng g @spartan-ng/cli:ui select
   ng g @spartan-ng/cli:ui checkbox
   ```

## Usage

### 1. Import the service in your component:

```typescript
import { ComplexDialogService } from "./lib/dialog";

export class MyComponent {
  private readonly dialogService = inject(ComplexDialogService);
}
```

### 2. Use the dialog methods:

#### Simple Confirmation:

```typescript
openConfirmation() {
  this.dialogService.confirm(
    'Are you sure you want to delete this item?',
    'Confirm Delete'
  ).subscribe(confirmed => {
    if (confirmed) {
      // Handle deletion
    }
  });
}
```

#### Form Dialog:

```typescript
openUserForm() {
  this.dialogService.openForm({
    title: 'User Information',
    data: {
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true }
      ]
    }
  }).subscribe(result => {
    if (result.action === 'submit') {
      console.log('Form data:', result.data);
    }
  });
}
```

## Key Features

✅ **Type-safe** - Full TypeScript support  
✅ **Accessible** - Built on Angular CDK  
✅ **Customizable** - Flexible configuration  
✅ **Validation** - Built-in form validation  
✅ **Responsive** - Tailwind CSS styling  
✅ **Observable-based** - RxJS integration

## Complete Examples

See `src/app/example-usage.component.ts` for comprehensive usage examples including:

- Confirmation dialogs (simple, custom, destructive)
- Form dialogs (contact forms, user profiles, complex validation)
- Advanced scenarios (large dialogs, non-closable, validation-heavy)

## Documentation

See `complex-dialog-guide.md` for detailed implementation guide and architecture explanation.
