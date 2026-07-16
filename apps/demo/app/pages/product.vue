<script setup lang="ts">
import { ref } from "vue";
import type { FormDefinition, Option, OptionsResolver, PathKey } from "@formblatt/core";
import { DynamicForm, DynamicField, readInput, type DynamicFormStore } from "@formblatt/vue";

/**
 * A product page as a form: the form owns size / color / qty / sku, the page
 * owns the presentation that reacts to them. Colors cascade from the size
 * (not every size comes in every color — an invalid pick is auto-cleared),
 * and the variant SKU is a computed field: empty until both are chosen,
 * `TS-{size}-{color}` once they are. Everything right of the images keys off
 * that one value.
 */
const productDefinition: FormDefinition = {
  id: "product-tshirt-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "size", kind: "enum", control: "radio", label: "Size",
      requiredMessage: "Pick a size",
      options: [
        { label: "S", value: "S" },
        { label: "M", value: "M" },
        { label: "L", value: "L" },
        { label: "XL", value: "XL" },
      ],
    },
    {
      name: "color", kind: "enum", control: "radio", label: "Color",
      requiredMessage: "Pick a color",
      optionsSource: { source: "colors", dependsOn: [["size"]] },
    },
    {
      name: "qty", kind: "number", control: "number", label: "Quantity", initial: 1,
      validations: [
        { type: "integer" },
        { type: "minValue", value: 1, message: "At least 1" },
        { type: "maxValue", value: 5, message: "Max. 5 per order — contact us for bulk pricing" },
      ],
    },
    {
      // in the data but never rendered — hidden computed fields still submit
      name: "sku", kind: "string", required: false, hidden: true,
      computed: {
        expression: {
          if: {
            and: [
              { path: ["size"], op: "notEmpty" },
              { path: ["color"], op: "notEmpty" },
            ],
          },
          then: { op: "concat", sep: "-", args: [{ const: "TS" }, { ref: ["size"] }, { ref: ["color"] }] },
          else: { const: "" },
        },
      },
    },
  ],
};

interface ColorInfo {
  label: string;
  hex: string;
  description: string;
}

const COLORS: Record<string, ColorInfo> = {
  BLK: {
    label: "Black",
    hex: "#1f2937",
    description: "Deep black wash on 220 g/m² organic cotton — holds its color through the years, not just the season.",
  },
  WHT: {
    label: "White",
    hex: "#e5e7eb",
    description: "Clean off-white on 220 g/m² organic cotton — the one you reach for with everything.",
  },
  OCN: {
    label: "Ocean",
    hex: "#1d4ed8",
    description: "A saturated ocean blue, garment-dyed on 220 g/m² organic cotton for a soft, lived-in feel.",
  },
  GRY: {
    label: "Heather grey",
    hex: "#9ca3af",
    description: "Classic heather grey — a cotton blend with just enough texture to look better up close.",
  },
};

/** Which colors each size actually comes in — the whole point of the cascade. */
const COLORS_BY_SIZE: Record<string, string[]> = {
  S: ["BLK", "WHT"],
  M: ["BLK", "WHT", "OCN"],
  L: ["BLK", "OCN", "GRY"],
  XL: ["GRY"],
};

const BASE_PRICE = 29;

const resolveOptions: OptionsResolver = async (source, { deps }): Promise<Option[]> => {
  if (source !== "colors") return [];

  await new Promise(resolve => setTimeout(resolve, 300));
  return (COLORS_BY_SIZE[deps.size as string] ?? [])
    .map(value => ({ label: COLORS[value]!.label, value }));
};

const valueAt = (form: DynamicFormStore, path: PathKey[]) => readInput(form, path);

interface Variant {
  sku: string;
  name: string;
  description: string;
  price: number;
  hex: string;
}

/** The variant record the page renders — `undefined` until the SKU computes. */
const variantOf = (form: DynamicFormStore): Variant | undefined => {
  const sku = valueAt(form, ["sku"]) as string | undefined;
  if (!sku) return undefined;

  const size = valueAt(form, ["size"]) as string;
  const color = COLORS[valueAt(form, ["color"]) as string]!;
  return {
    sku,
    name: `Organic Cotton Tee — ${color.label}`,
    description: color.description,
    price: BASE_PRICE + (size === "XL" ? 3 : 0),
    hex: color.hex,
  };
};

const money = (value: number) => `€${value.toFixed(2)}`;

const cart = ref<{ sku: string; qty: number; name: string; unitPrice: number }[]>([]);

const addToCart = (values: unknown, { form }: { form: DynamicFormStore }) => {
  const { sku, qty } = values as { sku: string; qty: number };
  const variant = variantOf(form)!;
  cart.value.push({ sku, qty, name: variant.name, unitPrice: variant.price });
}
</script>

<template>
  <div class="product-page">
    <header class="store">
      <span class="logo">NORTHBOUND</span>
      <span class="crumb">/ Men / T-Shirts</span>
      <span v-if="cart.length" class="cart-count">🛒 {{ cart.reduce((n, line) => n + line.qty, 0) }}</span>
    </header>

    <DynamicForm
      :definition="productDefinition"
      :resolve-options="resolveOptions"
      error-display="touched"
      @submit="addToCart"
      v-slot="{ form, isValid, isBusy, isSubmitting }"
    >
      <div class="product">
        <!-- left: images follow the computed variant -->
        <div class="gallery">
          <div class="image main" :style="{ background: variantOf(form)?.hex ?? '#f3f4f6' }">
            <span class="tee" :class="{ 'on-dark': !!variantOf(form) && variantOf(form)!.hex !== '#e5e7eb' }">👕</span>
          </div>
          <div class="thumbs">
            <div v-for="n in 3" :key="n" class="image thumb"
                 :style="{ background: variantOf(form)?.hex ?? '#f3f4f6', opacity: 1 - n * 0.18 }" />
          </div>
        </div>

        <!-- right: name, description and price key off the same variant -->
        <div class="info">
          <h1>{{ variantOf(form)?.name ?? "Organic Cotton Tee" }}</h1>
          <p class="sku">{{ variantOf(form) ? `SKU ${variantOf(form)!.sku}` : "Select a size and color" }}</p>
          <p class="price">
            {{ variantOf(form) ? money(variantOf(form)!.price) : `from ${money(BASE_PRICE)}` }}
          </p>
          <p class="description">
            {{ variantOf(form)?.description
              ?? "Our everyday tee in heavyweight organic cotton. Pre-shrunk, side-seamed, and cut a touch longer in the body." }}
          </p>

          <DynamicField name="size" />
          <DynamicField name="color" />
          <div class="qty">
            <DynamicField name="qty" />
          </div>

          <!-- explicitly disabled until the variant is complete — the requested UX -->
          <button type="submit" class="add-to-cart" :disabled="!isValid || isBusy || isSubmitting">
            {{ variantOf(form) ? `Add to cart · ${money(variantOf(form)!.price * Number(valueAt(form, ['qty']) ?? 1))}` : "Add to cart" }}
          </button>

          <ul v-if="cart.length" class="cart">
            <li v-for="(line, index) in cart" :key="index">
              {{ line.qty }} × {{ line.name }} <em>({{ line.sku }})</em> — {{ money(line.unitPrice * line.qty) }}
            </li>
          </ul>
        </div>
      </div>
    </DynamicForm>

    <aside class="try">
      <strong>Try:</strong> pick M + Ocean, then switch the size to S — Ocean isn't offered
      in S, so the color clears, the page falls back to the base product, and Add to cart
      disables until you pick again. XL only comes in Heather grey (and costs €3 more).
    </aside>
  </div>
</template>

<style scoped>
.product-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 4rem;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.store {
  display: flex;
  align-items: baseline;
  margin-bottom: 1.5rem;
}

.logo {
  font-weight: 700;
  letter-spacing: .14em;
  font-size: .95rem;
}

.crumb {
  margin-left: .5rem;
  color: #9ca3af;
  font-size: .9rem;
}

.cart-count {
  margin-left: auto;
  font-size: .9rem;
}

.product {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 2.5rem;
  align-items: start;
}

.gallery {
  position: sticky;
  top: 1.5rem;
}

.image {
  border-radius: 12px;
  transition: background .25s;
}

.image.main {
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 5;
}

.tee {
  font-size: 7rem;
  filter: grayscale(1) brightness(1.6);
}

.tee.on-dark {
  filter: grayscale(1) brightness(2.2);
}

.thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: .625rem;
  margin-top: .625rem;
}

.image.thumb {
  aspect-ratio: 1;
}

.info h1 {
  margin: 0 0 .2rem;
  font-size: 1.35rem;
  font-weight: 650;
}

.sku {
  margin: 0 0 .5rem;
  font-size: .78rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #9ca3af;
}

.price {
  margin: 0 0 .75rem;
  font-size: 1.2rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.description {
  margin: 0 0 1.25rem;
  font-size: .9rem;
  line-height: 1.55;
  color: #4b5563;
}

.info :deep(.field) {
  margin-bottom: 1rem;
}

.qty {
  max-width: 110px;
}

.add-to-cart {
  width: 100%;
  margin-top: .25rem;
  padding: .8rem 1rem;
  font: inherit;
  font-size: .95rem;
  font-weight: 600;
  color: #fff;
  background: #1f2937;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.add-to-cart:hover:not(:disabled) {
  background: #111827;
}

.add-to-cart:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.cart {
  margin: 1rem 0 0;
  padding: .75rem 1rem;
  list-style: none;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  font-size: .85rem;
  color: #065f46;
}

.cart li {
  padding: .15rem 0;
}

.cart em {
  font-style: normal;
  color: #34d399;
}

.try {
  margin-top: 2rem;
  padding: .875rem 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  font-size: .82rem;
  color: #78350f;
}

@media (max-width: 760px) {
  .product {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .gallery {
    position: static;
  }
}
</style>
