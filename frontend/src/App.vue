<template>
  <!-- ElConfigProvider 设置全局 z-index 初始值，
  让 Element Plus 自动递增 overlay z-index，
  替代 CSS !important 固定值方案，避免多弹窗层级冲突。 -->
  <el-config-provider :z-index="2000">
    <router-view />
  </el-config-provider>
</template>
