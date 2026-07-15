<script setup lang="ts"></script>

<template>
  <div class="app-shell">
    <nav class="app-nav">
      <NuxtLink to="/">JSON schema form</NuxtLink>
      <NuxtLink to="/checkout">Checkout</NuxtLink>
      <NuxtLink to="/cart">Cart</NuxtLink>
    </nav>
    <NuxtPage />
  </div>
</template>

<style>
body {
  margin: 0;
  background: #f6f6f7;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}
</style>

<style scoped>
.app-nav {
  display: flex;
  gap: 1.25rem;
  padding: .875rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  font-size: .9rem;
}

.app-nav a {
  color: #6b7280;
  text-decoration: none;
  font-weight: 550;
}

.app-nav a:hover {
  color: #1f2937;
}

.app-nav a.router-link-active {
  color: #4f46e5;
}
</style>
