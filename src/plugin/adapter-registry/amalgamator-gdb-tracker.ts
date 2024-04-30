/********************************************************************************
 * Copyright (C) 2024 Ericsson, Arm and others.
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

import { DebugProtocol } from '@vscode/debugprotocol';
import * as vscode from 'vscode';
import { Context, ReadMemoryArguments, ReadMemoryResult, WriteMemoryArguments, WriteMemoryResult } from '../../common/messaging';
import { AdapterCapabilities, AdapterVariableTracker, VariableTracker } from './adapter-capabilities';

// Copied from cdt-amalgamator [AmalgamatorSession.d.ts] file
/**
 * Response for our custom 'cdt-amalgamator/getChildDaps' request.
 */
export interface Contexts {
    children?: Context[];
}
export interface GetContextsResponse extends DebugProtocol.Response {
    body: Contexts;
}
export type GetContextsResult = GetContextsResponse['body'];

export interface AmalgamatorReadArgs extends ReadMemoryArguments {
    child: Context;
}

export class AmalgamatorSessionManager extends VariableTracker implements AdapterCapabilities {
    async getContexts(session: vscode.DebugSession): Promise<Context[]> {
        return this.sessions.get(session.id)?.getContexts?.(session) || [];
    }

    async readMemory(session: vscode.DebugSession, args: ReadMemoryArguments, context: Context): Promise<ReadMemoryResult> {
        if (!context) {
            vscode.window.showErrorMessage('Invalid context for Amalgamator. Select Context in Dropdown');
            return {
                address: args.memoryReference
            };
        }
        return this.sessions.get(session.id)?.readMemory?.(session, args, context);
    }

    async writeMemory(session: vscode.DebugSession, args: WriteMemoryArguments, context: Context): Promise<WriteMemoryResult> {
        return this.sessions.get(session.id)?.writeMemory?.(session, args, context);
    }

    async getCurrentContext(session: vscode.DebugSession): Promise<Context | undefined> {
        return this.sessions.get(session.id)?.getCurrentContext?.(session);
    }

    supportShowVariables(_session: vscode.DebugSession): boolean {
        return false;
    }
}

export class AmalgamatorGdbVariableTransformer extends AdapterVariableTracker {
    protected contexts?: Context[];
    protected currentContext?: Context;

    onWillReceiveMessage(message: unknown): void {
        if (isStacktraceRequest(message)) {
            if (typeof(message.arguments.threadId) !== 'undefined') {
                this.currentContext = {
                    id: message.arguments.threadId,
                    name: message.arguments.threadId.toString()
                };
            } else {
                this.logger.warn('Invalid ThreadID in stackTrace');
                this.currentContext = undefined;
            }
        } else {
            super.onWillReceiveMessage(message);
        }
    }

    get frame(): number | undefined { return this.currentFrame; }

    async getContexts(session: vscode.DebugSession): Promise<Context[]> {
        if (!this.contexts) {
            const contexts: GetContextsResult = (await session.customRequest('cdt-amalgamator/getChildDaps'));
            this.contexts = contexts.children?.map(({ name, id }) => ({ name, id })) ?? [];
        }
        return Promise.resolve(this.contexts);
    }

    async getCurrentContext(_session: vscode.DebugSession): Promise<Context | undefined> {
        const curContext = this.contexts?.length ?
            (this.contexts?.filter(context => context.id === this.currentContext?.id).shift() ??
            this.currentContext) :
            this.currentContext;
        return Promise.resolve(curContext);
    }

    readMemory(session: vscode.DebugSession, args: ReadMemoryArguments, context: Context): Promise<ReadMemoryResult> {
        const amalReadArgs: AmalgamatorReadArgs = { ...args, child: context };
        return Promise.resolve(session.customRequest('cdt-amalgamator/readMemory', amalReadArgs));
    }
}

export function isStacktraceRequest(message: unknown): message is DebugProtocol.StackTraceRequest {
    const candidate = message as DebugProtocol.StackTraceRequest;
    return !!candidate && candidate.command === 'stackTrace';
}

export function isStacktraceResponse(message: unknown): message is DebugProtocol.StackTraceResponse {
    const candidate = message as DebugProtocol.StackTraceResponse;
    return !!candidate && candidate.command === 'stackTrace' && Array.isArray(candidate.body.stackFrames);
}
