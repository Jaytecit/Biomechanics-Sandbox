/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Genome, NodeGene, ConnectionGene, NodeType } from './types';

// Simple global counter for innovation numbers to track NEAT ancestry
let globalInnovationNumber = 0;

export function getNextInnovationNumber(): number {
  return ++globalInnovationNumber;
}

/**
 * Creates a blank genome with the specified number of input and output nodes
 * and connects them with default random weights.
 */
export function createBaseGenome(inputsCount: number, outputsCount: number): Genome {
  const nodes: NodeGene[] = [];
  const connections: ConnectionGene[] = [];

  // Create input nodes
  for (let i = 0; i < inputsCount; i++) {
    nodes.push({
      id: i,
      type: 'input',
      label: `Input ${i}`,
    });
  }

  // Create output nodes
  for (let i = 0; i < outputsCount; i++) {
    nodes.push({
      id: inputsCount + i,
      type: 'output',
      label: `Output ${i}`,
    });
  }

  // Connect every input to every output with a random weight
  for (let i = 0; i < inputsCount; i++) {
    for (let j = 0; j < outputsCount; j++) {
      const outputId = inputsCount + j;
      connections.push({
        fromNode: i,
        toNode: outputId,
        weight: (Math.random() * 2 - 1) * 0.5, // Small initial weights
        enabled: true,
        innovation: getNextInnovationNumber(),
      });
    }
  }

  return { nodes, connections };
}

/**
 * Evaluates the genome network to generate outputs from the given inputs.
 * Uses a relaxed propagation algorithm that works perfectly for arbitrary NEAT topologies
 * (including recurrence) by running multiple signal propagation rounds.
 */
export function evaluateGenome(genome: Genome, inputs: number[]): number[] {
  const nodesMap = new Map<number, { val: number; nextVal: number; type: NodeType }>();
  
  // Initialize all nodes
  for (const node of genome.nodes) {
    nodesMap.set(node.id, { val: 0, nextVal: 0, type: node.type });
  }

  // Load input values
  const inputGenes = genome.nodes.filter(n => n.type === 'input');
  for (let i = 0; i < inputGenes.length; i++) {
    const nodeState = nodesMap.get(inputGenes[i].id);
    if (nodeState) {
      // Clamp inputs or pass them directly
      nodeState.val = inputs[i] || 0;
      nodeState.nextVal = inputs[i] || 0;
    }
  }

  // Propagation iterations (runs multiple times to flow signals through deep hidden layers)
  const PROPAGATION_ROUNDS = 3;
  for (let round = 0; round < PROPAGATION_ROUNDS; round++) {
    // Reset hidden and output accumulators for next step calculation
    for (const [id, state] of nodesMap.entries()) {
      if (state.type !== 'input') {
        state.nextVal = 0;
      }
    }

    // Propagate across connections
    for (const conn of genome.connections) {
      if (!conn.enabled) continue;
      const source = nodesMap.get(conn.fromNode);
      const dest = nodesMap.get(conn.toNode);
      
      if (source && dest) {
        dest.nextVal += source.val * conn.weight;
      }
    }

    // Apply activation function (tanh for outputs and hidden)
    for (const [id, state] of nodesMap.entries()) {
      if (state.type !== 'input') {
        state.val = Math.tanh(state.nextVal); // Tanh squashes to [-1, 1]
      }
    }
  }

  // Extract outputs
  const outputGenes = genome.nodes.filter(n => n.type === 'output');
  return outputGenes.map(node => {
    const state = nodesMap.get(node.id);
    return state ? state.val : 0;
  });
}

/**
 * Mutates the weights of existing connections.
 */
export function mutateWeights(genome: Genome, mutationRate: number): Genome {
  const newConnections = genome.connections.map(conn => {
    if (Math.random() < mutationRate) {
      // 90% chance of small perturbation, 10% chance of assigning entirely new weight
      const newWeight = Math.random() < 0.9
        ? conn.weight + (Math.random() * 2 - 1) * 0.2
        : (Math.random() * 2 - 1) * 1.5;

      // Clamp weight to sensible bounds
      const clampedWeight = Math.max(-3, Math.min(3, newWeight));

      return {
        ...conn,
        weight: clampedWeight,
      };
    }
    return conn;
  });

  return {
    ...genome,
    connections: newConnections,
  };
}

/**
 * Mutates by adding a connection between two random nodes.
 */
export function mutateAddConnection(genome: Genome): Genome {
  // Find potential valid connections (from, to) where from is not output, to is not input, and they aren't already connected
  const nonOutputs = genome.nodes.filter(n => n.type !== 'output');
  const nonInputs = genome.nodes.filter(n => n.type !== 'input');

  if (nonOutputs.length === 0 || nonInputs.length === 0) return genome;

  // Try multiple times to find a unique, valid connection
  for (let attempt = 0; attempt < 20; attempt++) {
    const fromNode = nonOutputs[Math.floor(Math.random() * nonOutputs.length)];
    const toNode = nonInputs[Math.floor(Math.random() * nonInputs.length)];

    // Basic cyclic/recurrent checks are fine, but NEAT allows recurrences.
    // However, connecting a node to itself or backward is allowed but let's avoid connecting the exact same nodes twice.
    if (fromNode.id === toNode.id) continue;

    const exists = genome.connections.some(
      c => c.fromNode === fromNode.id && c.toNode === toNode.id
    );

    if (!exists) {
      const newConnection: ConnectionGene = {
        fromNode: fromNode.id,
        toNode: toNode.id,
        weight: (Math.random() * 2 - 1) * 0.5,
        enabled: true,
        innovation: getNextInnovationNumber(),
      };

      return {
        ...genome,
        connections: [...genome.connections, newConnection],
      };
    }
  }

  return genome;
}

/**
 * Mutates by picking an existing connection, splitting it, and inserting a new hidden node in between.
 */
export function mutateAddNode(genome: Genome): Genome {
  const activeConnections = genome.connections.filter(c => c.enabled);
  if (activeConnections.length === 0) return genome;

  // Select a connection to split
  const splitConnIndex = Math.floor(Math.random() * activeConnections.length);
  const connToSplit = activeConnections[splitConnIndex];

  // Disable old connection
  const updatedConnections = genome.connections.map(c => {
    if (c.innovation === connToSplit.innovation) {
      return { ...c, enabled: false };
    }
    return c;
  });

  // Calculate new node ID (1 greater than current max ID)
  const maxNodeId = Math.max(...genome.nodes.map(n => n.id));
  const newNodeId = maxNodeId + 1;

  const newNode: NodeGene = {
    id: newNodeId,
    type: 'hidden',
    label: `Hidden ${newNodeId}`,
  };

  // Connection from input/source node to new node (weight 1.0)
  const conn1: ConnectionGene = {
    fromNode: connToSplit.fromNode,
    toNode: newNodeId,
    weight: 1.0,
    enabled: true,
    innovation: getNextInnovationNumber(),
  };

  // Connection from new node to original output/destination node (original weight)
  const conn2: ConnectionGene = {
    fromNode: newNodeId,
    toNode: connToSplit.toNode,
    weight: connToSplit.weight,
    enabled: true,
    innovation: getNextInnovationNumber(),
  };

  return {
    nodes: [...genome.nodes, newNode],
    connections: [...updatedConnections, conn1, conn2],
  };
}

/**
 * Standard crossover/mating of two genomes based on relative fitness.
 * Fits matching genes randomly or takes average, and inherits disjoint/excess genes from the fitter parent.
 */
export function crossover(parentA: Genome, parentB: Genome, fitnessA: number, fitnessB: number): Genome {
  const isAEqualOrFitter = fitnessA >= fitnessB;
  const fitterParent = isAEqualOrFitter ? parentA : parentB;
  const lessFitParent = isAEqualOrFitter ? parentB : parentA;

  const childNodes: NodeGene[] = [];
  const childConnections: ConnectionGene[] = [];

  // Add all nodes from fitter parent
  for (const node of fitterParent.nodes) {
    childNodes.push({ ...node });
  }

  // Connections are matched by innovation numbers
  const lessFitConnMap = new Map<number, ConnectionGene>();
  for (const conn of lessFitParent.connections) {
    lessFitConnMap.set(conn.innovation, conn);
  }

  for (const fitterConn of fitterParent.connections) {
    const matchingConn = lessFitConnMap.get(fitterConn.innovation);

    if (matchingConn) {
      // Matching genes: Randomly inherit weight from either parent
      const selectedConn = Math.random() < 0.5 ? fitterConn : matchingConn;
      
      // If either connection is disabled, there's a 75% chance the child's is disabled
      const isEnabled = (!fitterConn.enabled || !matchingConn.enabled)
        ? (Math.random() < 0.25)
        : true;

      childConnections.push({
        ...selectedConn,
        enabled: isEnabled,
      });
    } else {
      // Disjoint or Excess genes: Inherit from fitter parent
      childConnections.push({ ...fitterConn });
    }
  }

  // Ensure all node references in childConnections exist in childNodes (just in case)
  const nodeIds = new Set(childNodes.map(n => n.id));
  for (const conn of childConnections) {
    if (!nodeIds.has(conn.fromNode)) {
      // Create node as hidden
      childNodes.push({ id: conn.fromNode, type: 'hidden', label: `Hidden ${conn.fromNode}` });
      nodeIds.add(conn.fromNode);
    }
    if (!nodeIds.has(conn.toNode)) {
      // Create node as hidden
      childNodes.push({ id: conn.toNode, type: 'hidden', label: `Hidden ${conn.toNode}` });
      nodeIds.add(conn.toNode);
    }
  }

  return {
    nodes: childNodes.sort((a, b) => a.id - b.id),
    connections: childConnections,
  };
}

/**
 * Deep clones a genome.
 */
export function cloneGenome(genome: Genome): Genome {
  return {
    nodes: genome.nodes.map(n => ({ ...n })),
    connections: genome.connections.map(c => ({ ...c })),
  };
}
