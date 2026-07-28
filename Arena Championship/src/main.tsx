/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArenaApp } from './ArenaApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArenaApp />
  </StrictMode>
);
