/********************************************************************************
 * Copyright (C) 2022 Ericsson, Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import React from 'react';
import { createRoot } from 'react-dom/client';
import { HOST_EXTENSION } from 'vscode-messenger-common';
import {
    readyType,
    logMessageType,
    setOptionsType,
    readMemoryType
} from '../common/messaging';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { Memory, MemoryState } from './utils/view-types';
import { MemoryWidget } from './components/memory-widget';
import { messenger } from './view-messenger';

class App extends React.Component<{}, MemoryState> {

    public constructor(props: {}) {
        super(props);
        this.state = {
            memory: undefined,
            memoryReference: '',
            offset: 0,
            count: 256,
        };
    }

    public componentDidMount(): void {
        messenger.onRequest(setOptionsType, options => this.setOptions(options));
        messenger.sendNotification(readyType, HOST_EXTENSION, undefined);
    }

    public render(): React.ReactNode {
        return <MemoryWidget
            memory={this.state.memory}
            memoryReference={this.state.memoryReference}
            offset={this.state.offset ?? 0}
            count={this.state.count}
            updateMemoryArguments={this.updateMemoryState}
            refreshMemory={this.refreshMemory}
        />;
    }

    protected updateMemoryState = (newState: Partial<MemoryState>) => this.setState(prevState => ({ ...prevState, ...newState }));

    protected async setOptions(options?: Partial<DebugProtocol.ReadMemoryArguments>): Promise<void> {
        messenger.sendRequest(logMessageType, HOST_EXTENSION, JSON.stringify(options));
        this.setState(prevState => ({ ...prevState, ...options }));
        return this.fetchMemory(options);
    }

    protected refreshMemory = () => { this.fetchMemory(); };

    protected async fetchMemory(partialOptions?: Partial<DebugProtocol.ReadMemoryArguments>): Promise<void> {
        const completeOptions = {
            memoryReference: partialOptions?.memoryReference || this.state.memoryReference,
            offset: partialOptions?.offset ?? this.state.offset,
            count: partialOptions?.count ?? this.state.count
        };

        const response = await messenger.sendRequest(readMemoryType, HOST_EXTENSION, completeOptions);

        this.setState({
            memory: this.convertMemory(response)
        });
    }

    protected convertMemory(result: DebugProtocol.ReadMemoryResponse['body']): Memory {
        if (!result?.data) { throw new Error('No memory provided!'); }
        const address = BigInt(result.address);
        const bytes = Uint8Array.from(Buffer.from(result.data, 'base64'));
        return { bytes, address };
    }
}

const container = document.getElementById('root') as Element;
createRoot(container).render(<App />);
