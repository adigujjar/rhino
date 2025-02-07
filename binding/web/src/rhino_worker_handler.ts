/*
  Copyright 2022-2023 Picovoice Inc.

  You may not use this file except in compliance with the license. A copy of the license is located in the "LICENSE"
  file accompanying this source.

  Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
  an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
  specific language governing permissions and limitations under the License.
*/

/// <reference no-default-lib="false"/>
/// <reference lib="webworker" />

import { Rhino } from './rhino';
import { RhinoWorkerRequest, RhinoInference } from './types';

function inferenceCallback(inference: RhinoInference): void {
  self.postMessage({
    command: 'ok-process',
    inference: inference,
  });
}

function processErrorCallback(error: Error): void {
  self.postMessage({
    command: 'error',
    message: error.message,
  });
}

/**
 * Rhino worker handler.
 */
let rhino: Rhino | null = null;
self.onmessage = async function (
  event: MessageEvent<RhinoWorkerRequest>
): Promise<void> {
  switch (event.data.command) {
    case 'init':
      if (rhino !== null) {
        self.postMessage({
          command: 'error',
          message: 'Rhino already initialized',
        });
        return;
      }
      try {
        Rhino.setWasm(event.data.wasm);
        Rhino.setWasmSimd(event.data.wasmSimd);
        rhino = await Rhino._init(
          event.data.accessKey,
          event.data.contextPath,
          event.data.sensitivity,
          inferenceCallback,
          event.data.modelPath,
          { ...event.data.options, processErrorCallback }
        );
        self.postMessage({
          command: 'ok',
          version: rhino.version,
          frameLength: rhino.frameLength,
          sampleRate: rhino.sampleRate,
          contextInfo: rhino.contextInfo,
        });
      } catch (e: any) {
        self.postMessage({
          command: 'error',
          message: e.message,
        });
      }
      break;
    case 'process':
      if (rhino === null) {
        self.postMessage({
          command: 'error',
          message: 'Rhino not initialized',
        });
        return;
      }
      await rhino.process(event.data.inputFrame);
      break;
    case 'reset':
      if (rhino === null) {
        self.postMessage({
          command: 'error',
          message: 'Rhino not initialized',
        });
        return;
      }
      await rhino.reset();
      self.postMessage({
        command: 'ok',
      });
      break;
    case 'release':
      if (rhino !== null) {
        await rhino.release();
        rhino = null;
        close();
      }
      self.postMessage({
        command: 'ok',
      });
      break;
    default:
      self.postMessage({
        command: 'failed',
        // @ts-ignore
        message: `Unrecognized command: ${event.data.command}`,
      });
  }
};
