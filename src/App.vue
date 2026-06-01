<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue';
</script>

<template>
  <div class="p-light ">
    <Analytics />
    <router-view />
  </div>
</template>

<style>
@import './shared/assets/variables.scss';
</style>
