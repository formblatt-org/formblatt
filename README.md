<!-- PROJECT SHIELDS -->
<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Issues][issues-shield]][issues-url]
[![MIT][license-shield]][license-url]

</div>

<!-- PROJECT LOGO -->
<div align="center">
    <a href="https://github.com/formblatt-org/formblatt">
        <img src="./images/logo.svg" alt="Logo" width="80" height="80" />
    </a>
    <h1 align="center">Formblatt</h1>
    <p align="center">
      Lightweight, schema-first, feature-rich form builder.
      <br />
      <a href="#about-the-project">About</a>
      <br />
      <br />
      <a href="./apps/demo">View Demo</a>
      &middot;
      <a href="https://github.com/formblatt-org/formblatt/issues/new?labels=bug">Report Bug</a>
      &middot;
      <a href="https://github.com/formblatt-org/formblatt/issues/new?labels=enhancement">Request Feature</a>
    </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
    <summary>Table of Contents</summary>
    <ol>
        <li>
            <a href="#about-the-project">About The Project</a>
            <ul>
                <li><a href="#built-with">Built With</a></li>
            </ul>
        </li>
        <li>
            <a href="#getting-started">Getting Started</a>
            <ul>
                <li><a href="#prerequisites">Prerequisites</a></li>
                <li><a href="#installation">Installation</a></li>
            </ul>
        </li>
        <li><a href="#usage">Usage</a></li>
        <li><a href="#roadmap">Roadmap</a></li>
        <li><a href="#contributing">Contributing</a></li>
        <li><a href="#license">License</a></li>
        <li><a href="#acknowledgments">Acknowledgments</a></li>
    </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

**Server-driven forms. JSON in, forms out.** A *Formblatt* is a preprinted form - a form defined ahead of time that you fill in. That's the whole idea: the backend describes a form as JSON, Formblatt turns it into a live schema and fully wired form. Anything async - lookups, option sources, computed values - is resolved by the host through injected resolver functions.

A form definition covers, out of the box:

* **Validation** - field `validations` compile into [Valibot](https://valibot.dev) schemas
* **Computed fields** - a declarative expression DSL (`concat`, `add`, `dateDiff`, `round`, ...) or host-resolved sources
* **Cross-field effects** - `affects` such as `hideAndClear` and `populate`, driven by conditions
* **Dependent option sources** - options that re-resolve when the fields they depend on change
* **Array fields** - repeatable items with per-item fields and conditional checks
* **Layout** - collapsible sections and field placement, resolved from the definition
* **Definition migrations** - versioned definitions that upgrade older payloads

The monorepo contains:

| Package | Description |
| --- | --- |
| [`@formblatt/core`](./packages/core) | Framework-agnostic core: JSON form definitions to Valibot schemas, condition/expression evaluation, layout resolution, migrations |
| [`@formblatt/vue`](./packages/vue) | Vue bindings: composables and headless components over [@formisch/vue](https://github.com/open-circle/formisch) |
| [`formblatt-demo`](./apps/demo) | Nuxt demo app showcasing self-rendered, headless, and array-field forms |

### Built With

Built on top of: 

* [@formisch](https://github.com/open-circle/formisch)
* [@valibot](https://github.com/open-circle/valibot)

<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running follow these simple steps:

### Prerequisites

* [Node.js](https://nodejs.org/) 20.19+ (or 22.x)
* [pnpm](https://pnpm.io/) 10+

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/formblatt-org/formblatt.git
   cd formblatt
   ```
2. Install dependencies
   ```sh
   pnpm install
   ```
3. Run the demo app
   ```sh
   pnpm dev
   ```

Other useful workspace scripts:

```sh
pnpm test            # run tests across @formblatt/* packages
pnpm typecheck       # typecheck all packages
pnpm build:packages  # build @formblatt/core and @formblatt/vue
```

<!-- USAGE EXAMPLES -->
## Usage

Describe the form as JSON, hand it to `<DynamicForm>`, and inject resolvers for anything async:

```vue
<script setup lang="ts">
import type { FormDefinition, OptionsResolver } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

const definition: FormDefinition = {
  id: "signup-v1",
  fields: [
    { name: "firstName", kind: "string", control: "text", label: "First name" },
    { name: "lastName", kind: "string", control: "text", label: "Last name" },
    {
      name: "fullName", kind: "string", control: "text", label: "Full name", required: false,
      computed: { expression: { op: "concat", sep: " ", args: [{ ref: ["firstName"] }, { ref: ["lastName"] }] } },
    },
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    { name: "country", kind: "enum", control: "select", label: "Country", optionsSource: { source: "countries" } },
  ],
};

// Anything async is resolved by the host - here, an option source.
const resolveOptions: OptionsResolver = async (source) => {
  if (source !== "countries") return [];
  const response = await fetch("/api/countries");
  return response.json();
};

const onSubmit = (values: unknown) => console.log("submitted", values);
</script>

<template>
  <DynamicForm
    :definition="definition"
    :resolve-options="resolveOptions"
    submit-label="Sign up"
    @submit="onSubmit"
  />
</template>
```

Prefer your own markup? The same definition works headlessly - compose `DynamicField`, `DynamicFieldArray`, and the `use*` composables yourself instead of letting the form render its own layout.

The framework-agnostic core is also usable on its own:

```ts
import { buildFormSchema, buildInitialInput } from "@formblatt/core";

const schema = buildFormSchema(definition); // a Valibot schema
const initial = buildInitialInput(definition);
```

_For complete examples, run the demo app (`pnpm dev`) and browse:_

* `/` - a self-rendered account form: computed fields, populate-from-lookup, dependent selects
* `/checkout` - a headless checkout with hand-placed markup over the same definition
* `/cart` - array fields with per-item validation checks

<!-- ROADMAP -->
## Roadmap

- [ ] Publish `@formblatt/core` and `@formblatt/vue` to npm
- [ ] Documentation site with a full form-definition reference
- [ ] More built-in field controls
- [ ] Bindings for more frameworks (React, Solid, Svelte) on top of the framework-agnostic core

See the [open issues](https://github.com/formblatt-org/formblatt/issues) for a full list of proposed features (and known issues).

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Top contributors

<a href="https://github.com/formblatt-org/formblatt/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=formblatt-org/formblatt" alt="contrib.rocks image" /> 
</a>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Formisch](https://github.com/open-circle/formisch)
* [Valibot](https://github.com/open-circle/valibot)

<!-- Markdown Links & Images -->
[contributors-shield]: https://img.shields.io/github/contributors/formblatt-org/formblatt.svg?style=for-the-badge
[contributors-url]: https://github.com/formblatt-org/formblatt/graphs/contributors
[issues-shield]: https://img.shields.io/github/issues/formblatt-org/formblatt.svg?style=for-the-badge
[issues-url]: https://github.com/formblatt-org/formblatt/issues
[license-shield]: https://img.shields.io/github/license/formblatt-org/formblatt.svg?style=for-the-badge
[license-url]: https://github.com/formblatt-org/formblatt/blob/main/LICENSE
