//! Rust + WebAssembly GPU viewport engine for Nexo.
//!
//! Owns the graph layout, structured node ports (inputs, outputs, hypotheses,
//! requirements, validation), port-to-port cubic Bézier routing, embedded node
//! analytical mini-charts, camera state, spatial hit-testing, and zero-copy
//! WebGL2 vertex buffer generation.

use std::cmp::Ordering;

pub const CARD_WIDTH: f32 = 228.0;
pub const CARD_HEIGHT: f32 = 96.0;
pub const HALF_W: f32 = CARD_WIDTH * 0.5;
pub const HALF_H: f32 = CARD_HEIGHT * 0.5;

pub const FLOATS_PER_VERTEX: usize = 9;
pub const FLOATS_PER_TEXT_VERTEX: usize = 5;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NodeKind {
    Variable = 0,
    Equation = 1,
    Assumption = 2,
    Requirement = 3,
    Observation = 4,
    Group = 5,
}

impl NodeKind {
    pub fn from_u32(value: u32) -> Self {
        match value {
            0 => Self::Variable,
            1 => Self::Equation,
            2 => Self::Assumption,
            3 => Self::Requirement,
            5 => Self::Group,
            _ => Self::Observation,
        }
    }
}

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelationKind {
    InputTo = 0,
    Produces = 1,
    AssumptionFor = 2,
    Requires = 3,
    ValidatedBy = 4,
}

impl RelationKind {
    pub fn from_u32(value: u32) -> Self {
        match value {
            0 => Self::InputTo,
            1 => Self::Produces,
            2 => Self::AssumptionFor,
            3 => Self::Requires,
            _ => Self::ValidatedBy,
        }
    }
}

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortKind {
    Input = 0,
    Output = 1,
    Assumption = 2,
    Requirement = 3,
    Validation = 4,
}

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PortState {
    Normal = 0,
    Available = 1,
    Flagged = 2,
}

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChartKind {
    None = 4,
    Bar = 0,
    Stacked = 1,
    Gauge = 2,
    StatusSegments = 3,
}

#[derive(Clone, Copy, Debug)]
pub struct Port {
    pub kind: PortKind,
    pub state: PortState,
    pub x: f32,
    pub y: f32,
    pub nx: f32,
    pub ny: f32,
    pub connected: bool,
    pub slot: u8,
}

#[derive(Clone, Debug)]
pub struct NodeData {
    pub kind: NodeKind,
    pub x: f32,
    pub y: f32,
    pub is_derived: bool,
    pub has_value: bool,
    pub value: f64,
    pub ref_value: f64,
    pub tolerance: f64,
    pub flagged: bool,
    pub visible: bool,
    pub muted: bool,
    pub selected: bool,
    pub executing: bool,
    pub ports: Vec<Port>,
    pub chart_kind: ChartKind,
    pub chart_primary: f32,
    pub chart_secondary: f32,
    pub chart_segments: Vec<(f32, [f32; 4])>,
}

impl Default for NodeData {
    fn default() -> Self {
        Self {
            kind: NodeKind::Variable,
            x: 0.0,
            y: 0.0,
            is_derived: false,
            has_value: false,
            value: 0.0,
            ref_value: 0.0,
            tolerance: 0.0,
            flagged: false,
            visible: true,
            muted: false,
            selected: false,
            executing: false,
            ports: Vec::new(),
            chart_kind: ChartKind::Bar,
            chart_primary: 0.0,
            chart_secondary: 0.0,
            chart_segments: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct EdgeData {
    pub source: usize,
    pub target: usize,
    pub relation: RelationKind,
    pub source_port: usize,
    pub target_port: usize,
}

pub struct ViewportEngine {
    pub dark: bool,
    pub selection_color: [f32; 3],
    pub selection_halo: bool,
    pub nodes: Vec<NodeData>,
    pub edges: Vec<EdgeData>,
    pub width: f32,
    pub height: f32,
    pub dpr: f32,
    pub zoom: f32,
    pub pan_x: f32,
    pub pan_y: f32,
    pub hovered_node: i32,
    pub hovered_kind: u32,
    pub hovered_sub: i32,
    pub draft_active: bool,
    pub draft_sx: f32,
    pub draft_sy: f32,
    pub draft_snx: f32,
    pub draft_sny: f32,
    pub draft_tx: f32,
    pub draft_ty: f32,
    pub draft_tnx: f32,
    pub draft_tny: f32,
    pub draft_valid: bool,
    pub vertices: Vec<f32>,
    pub text_vertices: Vec<f32>,
    pub metrics: [f32; 8],
    pub atlas_cols: u32,
    pub atlas_rows: u32,
}

impl Default for ViewportEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ViewportEngine {
    pub fn new() -> Self {
        Self {
            dark: false,
            selection_color: [0.91, 0.61, 0.26],
            selection_halo: false,
            nodes: Vec::new(),
            edges: Vec::new(),
            width: 960.0,
            height: 640.0,
            dpr: 1.0,
            zoom: 1.0,
            pan_x: 120.0,
            pan_y: 320.0,
            hovered_node: -1,
            hovered_kind: 0,
            hovered_sub: -1,
            draft_active: false,
            draft_sx: 0.0,
            draft_sy: 0.0,
            draft_snx: 1.0,
            draft_sny: 0.0,
            draft_tx: 0.0,
            draft_ty: 0.0,
            draft_tnx: -1.0,
            draft_tny: 0.0,
            draft_valid: false,
            vertices: Vec::with_capacity(32_768),
            text_vertices: Vec::with_capacity(4_096),
            metrics: [0.0; 8],
            atlas_cols: 4,
            atlas_rows: 4,
        }
    }

    pub fn begin_model(&mut self, node_count: usize, edge_count: usize, preserve_positions: bool) {
        let old_positions: Vec<(f32, f32)> = if preserve_positions {
            self.nodes.iter().map(|n| (n.x, n.y)).collect()
        } else {
            Vec::new()
        };
        let fallback_cx = (self.width * 0.5 - self.pan_x) / self.zoom.max(0.1);
        let fallback_cy = (self.height * 0.5 - self.pan_y) / self.zoom.max(0.1);
        self.nodes.clear();
        self.nodes.resize_with(node_count, NodeData::default);
        for idx in 0..node_count {
            if let Some(&(x, y)) = old_positions.get(idx) {
                self.nodes[idx].x = x;
                self.nodes[idx].y = y;
            } else if preserve_positions {
                let offset = (idx.saturating_sub(old_positions.len()) as f32) * 36.0;
                self.nodes[idx].x = fallback_cx + offset;
                self.nodes[idx].y = fallback_cy + offset;
            }
        }
        self.edges.clear();
        self.edges.reserve(edge_count);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_node(
        &mut self,
        index: usize,
        kind: u32,
        is_derived: bool,
        has_value: bool,
        value: f64,
        ref_value: f64,
        tolerance: f64,
        flagged: bool,
        visible: bool,
        muted: bool,
        selected: bool,
    ) {
        if index >= self.nodes.len() {
            return;
        }
        let node = &mut self.nodes[index];
        node.kind = NodeKind::from_u32(kind);
        node.is_derived = is_derived;
        node.has_value = has_value;
        node.value = if value.is_finite() { value } else { 0.0 };
        node.ref_value = if ref_value.is_finite() {
            ref_value
        } else {
            0.0
        };
        node.tolerance = if tolerance.is_finite() {
            tolerance.abs()
        } else {
            0.0
        };
        node.flagged = flagged;
        node.visible = visible;
        node.muted = muted;
        node.selected = selected;
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_node_state(
        &mut self,
        index: usize,
        is_derived: bool,
        has_value: bool,
        value: f64,
        ref_value: f64,
        tolerance: f64,
        flagged: bool,
        visible: bool,
        muted: bool,
        selected: bool,
    ) {
        if index >= self.nodes.len() {
            return;
        }
        let node = &mut self.nodes[index];
        node.is_derived = is_derived;
        node.has_value = has_value;
        node.value = if value.is_finite() { value } else { 0.0 };
        node.ref_value = if ref_value.is_finite() {
            ref_value
        } else {
            0.0
        };
        node.tolerance = if tolerance.is_finite() {
            tolerance.abs()
        } else {
            0.0
        };
        node.flagged = flagged;
        node.visible = visible;
        node.muted = muted;
        node.selected = selected;
    }

    pub fn set_executing_node(&mut self, index: i32) {
        for (i, node) in self.nodes.iter_mut().enumerate() {
            node.executing = (i as i32) == index;
        }
    }

    pub fn add_edge(&mut self, source: usize, target: usize, relation: u32) {
        if source >= self.nodes.len() || target >= self.nodes.len() {
            return;
        }
        self.edges.push(EdgeData {
            source,
            target,
            relation: RelationKind::from_u32(relation),
            source_port: 0,
            target_port: 0,
        });
    }

    pub fn finish_model(&mut self, run_layout: bool) {
        if run_layout {
            self.arrange();
        } else {
            self.rebuild_ports();
            self.recompute_charts();
            self.update_metrics();
        }
    }

    /// Left-to-right dependency layering with barycenter crossing minimization.
    /// Cycles remain visible in a dedicated fallback column; layout is never treated as a solver.
    pub fn arrange(&mut self) {
        let n = self.nodes.len();
        if n == 0 {
            self.update_metrics();
            return;
        }
        let mut incoming = vec![0usize; n];
        let mut rank = vec![0usize; n];
        let mut out_edges: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut in_edges: Vec<Vec<usize>> = vec![Vec::new(); n];

        for edge in &self.edges {
            if edge.source != edge.target {
                incoming[edge.target] += 1;
                out_edges[edge.source].push(edge.target);
                in_edges[edge.target].push(edge.source);
            }
        }

        let mut queue: Vec<usize> = (0..n).filter(|&i| incoming[i] == 0).collect();
        let mut visited = vec![false; n];
        let mut head = 0;

        while head < queue.len() {
            let u = queue[head];
            head += 1;
            visited[u] = true;
            for &v in &out_edges[u] {
                if rank[u] + 1 > rank[v] {
                    rank[v] = rank[u] + 1;
                }
                if incoming[v] > 0 {
                    incoming[v] -= 1;
                    if incoming[v] == 0 {
                        queue.push(v);
                    }
                }
            }
        }

        let max_rank = rank.iter().copied().max().unwrap_or(0);
        let fallback = max_rank + 1;
        let num_layers = fallback + 1;
        let mut layers: Vec<Vec<usize>> = vec![Vec::new(); num_layers];

        for i in 0..n {
            let r = if visited[i] { rank[i] } else { fallback };
            layers[r].push(i);
        }

        // Initial vertical order by node kind and index for stability
        let mut y_hint = vec![0.0f32; n];
        for layer in &mut layers {
            layer.sort_by_key(|&i| (self.nodes[i].kind as u32, i));
            let len = layer.len() as f32;
            for (row, &node_idx) in layer.iter().enumerate() {
                y_hint[node_idx] = (row as f32 - (len - 1.0) * 0.5) * 130.0;
            }
        }

        // Two-pass barycenter crossing reduction (forward and backward)
        for _ in 0..2 {
            for r in 1..num_layers {
                if layers[r].len() <= 1 {
                    continue;
                }
                layers[r].sort_by(|&a, &b| {
                    let bary_a = neighbor_barycenter(a, &in_edges[a], &y_hint);
                    let bary_b = neighbor_barycenter(b, &in_edges[b], &y_hint);
                    bary_a
                        .partial_cmp(&bary_b)
                        .unwrap_or(Ordering::Equal)
                        .then_with(|| a.cmp(&b))
                });
                let len = layers[r].len() as f32;
                for (row, &node_idx) in layers[r].iter().enumerate() {
                    y_hint[node_idx] = (row as f32 - (len - 1.0) * 0.5) * 130.0;
                }
            }
            for r in (0..num_layers.saturating_sub(1)).rev() {
                if layers[r].len() <= 1 {
                    continue;
                }
                layers[r].sort_by(|&a, &b| {
                    let bary_a = neighbor_barycenter(a, &out_edges[a], &y_hint);
                    let bary_b = neighbor_barycenter(b, &out_edges[b], &y_hint);
                    bary_a
                        .partial_cmp(&bary_b)
                        .unwrap_or(Ordering::Equal)
                        .then_with(|| a.cmp(&b))
                });
                let len = layers[r].len() as f32;
                for (row, &node_idx) in layers[r].iter().enumerate() {
                    y_hint[node_idx] = (row as f32 - (len - 1.0) * 0.5) * 130.0;
                }
            }
        }

        let mut column = 0usize;
        for layer in layers.into_iter().filter(|l| !l.is_empty()) {
            for chunk in layer.chunks(9) {
                let len = chunk.len() as f32;
                let v_step = if chunk.len() <= 2 {
                    236.0
                } else if chunk.len() <= 4 {
                    168.0
                } else {
                    114.0
                };
                for (row, &node_idx) in chunk.iter().enumerate() {
                    self.nodes[node_idx].x = column as f32 * 316.0;
                    self.nodes[node_idx].y = (row as f32 - (len - 1.0) * 0.5) * v_step;
                }
                column += 1;
            }
        }

        self.rebuild_ports();
        self.recompute_charts();
        self.fit_all();
    }

    /// Recomputes structured, typed ports on every node and assigns every edge
    /// to its exact ordered source and target port pins so connections don't overlap.
    pub fn rebuild_ports(&mut self) {
        let n = self.nodes.len();
        if n == 0 {
            return;
        }

        for node in &mut self.nodes {
            node.ports.clear();
        }

        // Collect edges attached to each node grouped by port role
        let mut incoming_data: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut outgoing_data: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut incoming_assumption: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut incoming_requirement: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut incoming_validation: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut outgoing_validation: Vec<Vec<usize>> = vec![Vec::new(); n];

        for (edge_idx, edge) in self.edges.iter().enumerate() {
            match edge.relation {
                RelationKind::InputTo | RelationKind::Produces => {
                    outgoing_data[edge.source].push(edge_idx);
                    incoming_data[edge.target].push(edge_idx);
                }
                RelationKind::AssumptionFor => {
                    outgoing_data[edge.source].push(edge_idx);
                    incoming_assumption[edge.target].push(edge_idx);
                }
                RelationKind::Requires => {
                    outgoing_data[edge.source].push(edge_idx);
                    incoming_requirement[edge.target].push(edge_idx);
                }
                RelationKind::ValidatedBy => {
                    outgoing_validation[edge.source].push(edge_idx);
                    incoming_validation[edge.target].push(edge_idx);
                }
            }
        }

        let positions: Vec<(f32, f32, bool, bool)> = self
            .nodes
            .iter()
            .map(|node| (node.x, node.y, node.flagged, node.has_value))
            .collect();

        let mut source_ports = vec![0usize; self.edges.len()];
        let mut target_ports = vec![0usize; self.edges.len()];

        for node_idx in 0..n {
            let (nx, ny, n_flagged, n_has_val) = positions[node_idx];
            let kind = self.nodes[node_idx].kind;
            let mut ports = Vec::with_capacity(8);

            // 1. Left Edge: Data Input ports (sorted by source node Y so wires enter cleanly)
            let in_edges = &mut incoming_data[node_idx];
            in_edges.sort_by(|&ea, &eb| {
                let sa = self.edges[ea].source;
                let sb = self.edges[eb].source;
                positions[sa]
                    .1
                    .partial_cmp(&positions[sb].1)
                    .unwrap_or(Ordering::Equal)
                    .then_with(|| sa.cmp(&sb))
            });

            if !in_edges.is_empty() {
                let count = in_edges.len();
                let span = (CARD_HEIGHT - 36.0).min(count as f32 * 18.0);
                for (slot, &edge_idx) in in_edges.iter().enumerate() {
                    let offset = if count == 1 {
                        0.0
                    } else {
                        -span * 0.5 + span * (slot as f32 / (count - 1) as f32)
                    };
                    let src = self.edges[edge_idx].source;
                    let state = if n_flagged || positions[src].2 {
                        PortState::Flagged
                    } else if positions[src].3 {
                        PortState::Available
                    } else {
                        PortState::Normal
                    };
                    let port_id = ports.len();
                    ports.push(Port {
                        kind: PortKind::Input,
                        state,
                        x: nx - HALF_W,
                        y: ny + offset,
                        nx: -1.0,
                        ny: 0.0,
                        connected: true,
                        slot: slot as u8,
                    });
                    target_ports[edge_idx] = port_id;
                }
            } else if matches!(kind, NodeKind::Equation | NodeKind::Variable) {
                // Default disconnected input terminal for visual structure
                ports.push(Port {
                    kind: PortKind::Input,
                    state: if n_flagged {
                        PortState::Flagged
                    } else {
                        PortState::Normal
                    },
                    x: nx - HALF_W,
                    y: ny,
                    nx: -1.0,
                    ny: 0.0,
                    connected: false,
                    slot: 0,
                });
            }

            // 2. Right Edge: Data Output ports (sorted by target node Y)
            let out_edges = &mut outgoing_data[node_idx];
            out_edges.sort_by(|&ea, &eb| {
                let ta = self.edges[ea].target;
                let tb = self.edges[eb].target;
                positions[ta]
                    .1
                    .partial_cmp(&positions[tb].1)
                    .unwrap_or(Ordering::Equal)
                    .then_with(|| ta.cmp(&tb))
            });

            if !out_edges.is_empty() {
                let count = out_edges.len();
                let span = (CARD_HEIGHT - 40.0).min(count as f32 * 16.0);
                for (slot, &edge_idx) in out_edges.iter().enumerate() {
                    let offset = if count == 1 {
                        0.0
                    } else {
                        -span * 0.5 + span * (slot as f32 / (count - 1) as f32)
                    };
                    let dst = self.edges[edge_idx].target;
                    let p_kind = match kind {
                        NodeKind::Assumption => PortKind::Assumption,
                        NodeKind::Requirement => PortKind::Requirement,
                        _ => PortKind::Output,
                    };
                    let state = if n_flagged || positions[dst].2 {
                        PortState::Flagged
                    } else if n_has_val {
                        PortState::Available
                    } else {
                        PortState::Normal
                    };
                    let port_id = ports.len();
                    ports.push(Port {
                        kind: p_kind,
                        state,
                        x: nx + HALF_W,
                        y: ny + offset,
                        nx: 1.0,
                        ny: 0.0,
                        connected: true,
                        slot: slot as u8,
                    });
                    source_ports[edge_idx] = port_id;
                }
            } else if kind != NodeKind::Observation {
                ports.push(Port {
                    kind: PortKind::Output,
                    state: if n_flagged {
                        PortState::Flagged
                    } else {
                        PortState::Normal
                    },
                    x: nx + HALF_W,
                    y: ny,
                    nx: 1.0,
                    ny: 0.0,
                    connected: false,
                    slot: 0,
                });
            }

            // 3. Top Edge: Hypothesis / Assumption State Ports (on Equations)
            let assump_edges = &mut incoming_assumption[node_idx];
            assump_edges.sort_by_key(|&e| self.edges[e].source);
            if !assump_edges.is_empty() {
                let count = assump_edges.len();
                let span = (CARD_WIDTH - 90.0).min(count as f32 * 26.0);
                for (slot, &edge_idx) in assump_edges.iter().enumerate() {
                    let offset = if count == 1 {
                        -18.0
                    } else {
                        -span * 0.5 + span * (slot as f32 / (count - 1) as f32)
                    };
                    let src = self.edges[edge_idx].source;
                    let port_id = ports.len();
                    ports.push(Port {
                        kind: PortKind::Assumption,
                        state: if n_flagged || positions[src].2 {
                            PortState::Flagged
                        } else {
                            PortState::Available
                        },
                        x: nx + offset,
                        y: ny - HALF_H,
                        nx: 0.0,
                        ny: -1.0,
                        connected: true,
                        slot: slot as u8,
                    });
                    target_ports[edge_idx] = port_id;
                }
            } else if kind == NodeKind::Equation {
                ports.push(Port {
                    kind: PortKind::Assumption,
                    state: PortState::Normal,
                    x: nx - 18.0,
                    y: ny - HALF_H,
                    nx: 0.0,
                    ny: -1.0,
                    connected: false,
                    slot: 0,
                });
            }

            // 4. Bottom Edge: Requirement State Ports (on Equations)
            let req_edges = &mut incoming_requirement[node_idx];
            req_edges.sort_by_key(|&e| self.edges[e].source);
            if !req_edges.is_empty() {
                let count = req_edges.len();
                let span = (CARD_WIDTH - 90.0).min(count as f32 * 26.0);
                for (slot, &edge_idx) in req_edges.iter().enumerate() {
                    let offset = if count == 1 {
                        -18.0
                    } else {
                        -span * 0.5 + span * (slot as f32 / (count - 1) as f32)
                    };
                    let src = self.edges[edge_idx].source;
                    let port_id = ports.len();
                    ports.push(Port {
                        kind: PortKind::Requirement,
                        state: if n_flagged || positions[src].2 {
                            PortState::Flagged
                        } else {
                            PortState::Available
                        },
                        x: nx + offset,
                        y: ny + HALF_H,
                        nx: 0.0,
                        ny: 1.0,
                        connected: true,
                        slot: slot as u8,
                    });
                    target_ports[edge_idx] = port_id;
                }
            } else if kind == NodeKind::Equation {
                ports.push(Port {
                    kind: PortKind::Requirement,
                    state: PortState::Normal,
                    x: nx - 18.0,
                    y: ny + HALF_H,
                    nx: 0.0,
                    ny: 1.0,
                    connected: false,
                    slot: 0,
                });
            }

            // 5. Validation Ports (between Variable and Observation)
            for (slot, &edge_idx) in outgoing_validation[node_idx].iter().enumerate() {
                let dst = self.edges[edge_idx].target;
                let (dx, dy) = (positions[dst].0 - nx, positions[dst].1 - ny);
                let (px, py, pnx, pny) = if dy.abs() > dx.abs() * 0.7 {
                    let sign = if dy >= 0.0 { 1.0 } else { -1.0 };
                    (nx + 24.0, ny + HALF_H * sign, 0.0, sign)
                } else {
                    (nx + HALF_W, ny + 20.0, 1.0, 0.0)
                };
                let port_id = ports.len();
                ports.push(Port {
                    kind: PortKind::Validation,
                    state: if n_flagged || positions[dst].2 {
                        PortState::Flagged
                    } else {
                        PortState::Available
                    },
                    x: px,
                    y: py,
                    nx: pnx,
                    ny: pny,
                    connected: true,
                    slot: slot as u8,
                });
                source_ports[edge_idx] = port_id;
            }

            if !incoming_validation[node_idx].is_empty() {
                for (slot, &edge_idx) in incoming_validation[node_idx].iter().enumerate() {
                    let src = self.edges[edge_idx].source;
                    let (dx, dy) = (positions[src].0 - nx, positions[src].1 - ny);
                    let (px, py, pnx, pny) = if dy.abs() > dx.abs() * 0.7 {
                        let sign = if dy >= 0.0 { 1.0 } else { -1.0 };
                        (nx - 24.0, ny + HALF_H * sign, 0.0, sign)
                    } else {
                        (nx - HALF_W, ny, -1.0, 0.0)
                    };
                    let port_id = ports.len();
                    ports.push(Port {
                        kind: PortKind::Validation,
                        state: if n_flagged || positions[src].2 {
                            PortState::Flagged
                        } else {
                            PortState::Available
                        },
                        x: px,
                        y: py,
                        nx: pnx,
                        ny: pny,
                        connected: true,
                        slot: slot as u8,
                    });
                    target_ports[edge_idx] = port_id;
                }
            } else if kind == NodeKind::Observation {
                ports.push(Port {
                    kind: PortKind::Validation,
                    state: if n_flagged {
                        PortState::Flagged
                    } else {
                        PortState::Normal
                    },
                    x: nx - HALF_W,
                    y: ny,
                    nx: -1.0,
                    ny: 0.0,
                    connected: false,
                    slot: 0,
                });
            }

            self.nodes[node_idx].ports = ports;
        }

        for (idx, edge) in self.edges.iter_mut().enumerate() {
            edge.source_port = source_ports[idx];
            edge.target_port = target_ports[idx];
        }
    }

    /// Topology indicators only. Values with different dimensions must never be
    /// normalized into contribution percentages. Scientific charts require a
    /// unit-aware evidence contract from the scientific engine.
    pub fn recompute_charts(&mut self) {
        for node in &mut self.nodes {
            node.chart_kind = ChartKind::None;
            node.chart_primary = 0.0;
            node.chart_secondary = 0.0;
            node.chart_segments.clear();
        }
        for idx in 0..self.nodes.len() {
            if self.nodes[idx].kind != NodeKind::Equation {
                continue;
            }
            let inputs: Vec<usize> = self
                .edges
                .iter()
                .filter(|e| e.target == idx && e.relation == RelationKind::InputTo)
                .map(|e| e.source)
                .collect();
            if inputs.is_empty() {
                continue;
            }
            let segments = inputs
                .iter()
                .map(|&source| {
                    let n = &self.nodes[source];
                    let color = if n.flagged {
                        [0.90, 0.53, 0.12, 0.9]
                    } else if n.has_value {
                        [0.10, 0.60, 0.94, 0.8]
                    } else {
                        [0.68, 0.73, 0.79, 0.7]
                    };
                    (1.0 / inputs.len() as f32, color)
                })
                .collect();
            self.nodes[idx].chart_kind = ChartKind::Stacked;
            self.nodes[idx].chart_segments = segments;
        }
    }

    pub fn resize(&mut self, width: f32, height: f32, dpr: f32) {
        if width > 0.0 && height > 0.0 {
            self.width = width;
            self.height = height;
        }
        if dpr > 0.0 {
            self.dpr = dpr.clamp(1.0, 2.5);
        }
        self.update_metrics();
    }

    pub fn fit_all(&mut self) {
        let visible: Vec<usize> = (0..self.nodes.len())
            .filter(|&i| self.nodes[i].visible)
            .collect();
        self.fit_subset(&visible);
    }

    pub fn focus_node(&mut self, index: usize) {
        if index >= self.nodes.len() {
            return;
        }
        self.nodes[index].visible = true;
        let mut neighborhood = vec![index];
        for edge in &self.edges {
            if edge.source == index && self.nodes[edge.target].visible {
                neighborhood.push(edge.target);
            } else if edge.target == index && self.nodes[edge.source].visible {
                neighborhood.push(edge.source);
            }
        }
        self.fit_subset(&neighborhood);
    }

    fn fit_subset(&mut self, indices: &[usize]) {
        if indices.is_empty() || self.width <= 1.0 || self.height <= 1.0 {
            self.update_metrics();
            return;
        }
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;

        for &idx in indices {
            let node = &self.nodes[idx];
            min_x = min_x.min(node.x - HALF_W - 14.0);
            min_y = min_y.min(node.y - HALF_H - 14.0);
            max_x = max_x.max(node.x + HALF_W + 14.0);
            max_y = max_y.max(node.y + HALF_H + 14.0);
        }

        let bw = (max_x - min_x).max(CARD_WIDTH);
        let bh = (max_y - min_y).max(CARD_HEIGHT);
        let pad = 96.0;
        let avail_w = (self.width - pad).max(120.0);
        let avail_h = (self.height - pad).max(120.0);
        let z = (avail_w / bw).min(avail_h / bh).clamp(0.1, 1.0);

        let cx = (min_x + max_x) * 0.5;
        let cy = (min_y + max_y) * 0.5;
        self.zoom = z;
        self.pan_x = self.width * 0.5 - cx * z;
        self.pan_y = self.height * 0.5 - cy * z;
        self.update_metrics();
    }

    pub fn zoom_at(&mut self, target_zoom: f32, screen_x: f32, screen_y: f32) {
        let clamped = target_zoom.clamp(0.1, 4.0);
        let wx = (screen_x - self.pan_x) / self.zoom;
        let wy = (screen_y - self.pan_y) / self.zoom;
        self.zoom = clamped;
        self.pan_x = screen_x - wx * clamped;
        self.pan_y = screen_y - wy * clamped;
        self.update_metrics();
    }

    pub fn pan_by(&mut self, dx: f32, dy: f32) {
        self.pan_x += dx;
        self.pan_y += dy;
        self.update_metrics();
    }

    pub fn center_on_world(&mut self, wx: f32, wy: f32) {
        self.pan_x = self.width * 0.5 - wx * self.zoom;
        self.pan_y = self.height * 0.5 - wy * self.zoom;
        self.update_metrics();
    }

    pub fn move_node(&mut self, index: usize, world_x: f32, world_y: f32) {
        if index >= self.nodes.len() {
            return;
        }
        self.nodes[index].x = world_x;
        self.nodes[index].y = world_y;
        self.rebuild_ports();
        self.update_metrics();
    }

    /// Returns the cubic Bézier control points `((sx, sy), (c1x, c1y), (c2x, c2y), (end_x, end_y))`
    /// and target port `(tx, ty, tnx, tny)` for a given edge index.
    #[allow(clippy::type_complexity)]
    pub fn edge_curve(
        &self,
        edge_idx: usize,
    ) -> Option<(
        (f32, f32),
        (f32, f32),
        (f32, f32),
        (f32, f32),
        (f32, f32, f32, f32),
    )> {
        let edge = *self.edges.get(edge_idx)?;
        if !self.nodes.get(edge.source)?.visible || !self.nodes.get(edge.target)?.visible {
            return None;
        }
        let src_node = &self.nodes[edge.source];
        let dst_node = &self.nodes[edge.target];

        let (sx, sy, snx, sny) = src_node
            .ports
            .get(edge.source_port)
            .map(|p| (p.x, p.y, p.nx, p.ny))
            .unwrap_or((src_node.x + HALF_W, src_node.y, 1.0, 0.0));
        let (tx, ty, tnx, tny) = dst_node
            .ports
            .get(edge.target_port)
            .map(|p| (p.x, p.y, p.nx, p.ny))
            .unwrap_or((dst_node.x - HALF_W, dst_node.y, -1.0, 0.0));

        let tip_backoff = 8.5;
        let end_x = tx + tnx * tip_backoff;
        let end_y = ty + tny * tip_backoff;
        let dist = ((end_x - sx).hypot(end_y - sy)).max(24.0);
        let handle = (dist * 0.42).clamp(34.0, 150.0);
        let c1x = sx + snx * handle;
        let c1y = sy + sny * handle;
        let c2x = end_x + tnx * handle;
        let c2y = end_y + tny * handle;

        Some((
            (sx, sy),
            (c1x, c1y),
            (c2x, c2y),
            (end_x, end_y),
            (tx, ty, tnx, tny),
        ))
    }

    /// Hit-tests a screen position `(screen_x, screen_y)` in CSS pixels.
    /// Returns `(index << 8) | hit_kind` where:
    /// `0 = None`, `1 = NodeBody`, `2 = NodeMoreButton`, `3 = Port`, `4 = EdgeWire`.
    pub fn hit_test(&self, screen_x: f32, screen_y: f32) -> u32 {
        let wx = (screen_x - self.pan_x) / self.zoom;
        let wy = (screen_y - self.pan_y) / self.zoom;

        for (idx, node) in self.nodes.iter().enumerate().rev() {
            if !node.visible {
                continue;
            }
            // Check options (⋯) button at top-right of card first
            let more_x = node.x + HALF_W - 18.0;
            let more_y = node.y - HALF_H + 16.0;
            if (wx - more_x).abs() <= 14.0 && (wy - more_y).abs() <= 12.0 {
                return ((idx as u32) << 8) | 2;
            }
            // Check ports around perimeter (generous 9.5 world-unit radius for easy wiring)
            for port in &node.ports {
                let dx = wx - port.x;
                let dy = wy - port.y;
                if dx * dx + dy * dy <= 90.25 {
                    return ((idx as u32) << 8) | 3;
                }
            }
            // Check card body
            if (wx - node.x).abs() <= HALF_W && (wy - node.y).abs() <= HALF_H {
                return ((idx as u32) << 8) | 1;
            }
        }

        // Check connection wires (cubic Bézier curves)
        let wire_tol = (7.5 / self.zoom).clamp(4.5, 14.0);
        let wire_tol_sq = wire_tol * wire_tol;
        for edge_idx in (0..self.edges.len()).rev() {
            if let Some((p0, p1, p2, p3, _)) = self.edge_curve(edge_idx) {
                let mut prev = p0;
                for step in 1..=22 {
                    let t = step as f32 / 22.0;
                    let curr = cubic_bezier_point(p0, p1, p2, p3, t);
                    if dist_to_segment_sq((wx, wy), prev, curr) <= wire_tol_sq {
                        return ((edge_idx as u32) << 8) | 4;
                    }
                    prev = curr;
                }
            }
        }

        0
    }

    /// Returns the port index (`0..ports.len()`) on the node hit at `(screen_x, screen_y)`, or `-1`.
    pub fn hit_port_index(&self, screen_x: f32, screen_y: f32) -> i32 {
        let wx = (screen_x - self.pan_x) / self.zoom;
        let wy = (screen_y - self.pan_y) / self.zoom;

        for node in self.nodes.iter().rev() {
            if !node.visible {
                continue;
            }
            for (p_idx, port) in node.ports.iter().enumerate() {
                let dx = wx - port.x;
                let dy = wy - port.y;
                if dx * dx + dy * dy <= 90.25 {
                    return p_idx as i32;
                }
            }
        }
        -1
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_draft_wire(
        &mut self,
        sx: f32,
        sy: f32,
        snx: f32,
        sny: f32,
        tx: f32,
        ty: f32,
        tnx: f32,
        tny: f32,
        valid: bool,
    ) {
        self.draft_active = true;
        self.draft_sx = sx;
        self.draft_sy = sy;
        self.draft_snx = snx;
        self.draft_sny = sny;
        self.draft_tx = tx;
        self.draft_ty = ty;
        self.draft_tnx = tnx;
        self.draft_tny = tny;
        self.draft_valid = valid;
    }

    pub fn clear_draft_wire(&mut self) {
        self.draft_active = false;
    }

    pub fn update_metrics(&mut self) {
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut count = 0usize;

        for node in &self.nodes {
            if !node.visible {
                continue;
            }
            count += 1;
            min_x = min_x.min(node.x - HALF_W);
            min_y = min_y.min(node.y - HALF_H);
            max_x = max_x.max(node.x + HALF_W);
            max_y = max_y.max(node.y + HALF_H);
        }

        if count == 0 {
            min_x = -200.0;
            min_y = -120.0;
            max_x = 200.0;
            max_y = 120.0;
        }

        let bx1 = min_x - 24.0;
        let by1 = min_y - 24.0;
        let bw = (max_x - min_x + 48.0).max(1.0);
        let bh = (max_y - min_y + 48.0).max(1.0);

        let ex1 = -self.pan_x / self.zoom;
        let ey1 = -self.pan_y / self.zoom;
        let ew = self.width / self.zoom;
        let eh = self.height / self.zoom;

        self.metrics = [bx1, by1, bw, bh, ex1, ey1, ew, eh];
    }

    pub fn configure_atlas(&mut self, cols: u32, rows: u32) {
        self.atlas_cols = cols.max(1);
        self.atlas_rows = rows.max(1);
    }

    /// Generates the interleaved WebGL2 vertex buffer and text-atlas quad buffer
    /// in WASM linear memory for the current camera frustum.
    pub fn build_frame(&mut self) {
        self.vertices.clear();
        self.text_vertices.clear();
        self.update_metrics();

        let ex1 = self.metrics[4] - 260.0;
        let ey1 = self.metrics[5] - 180.0;
        let ex2 = self.metrics[4] + self.metrics[6] + 260.0;
        let ey2 = self.metrics[5] + self.metrics[7] + 180.0;

        // 1. Routed Port-to-Port Connections (Wires)
        for edge_idx in 0..self.edges.len() {
            let edge = self.edges[edge_idx];
            if !self.nodes[edge.source].visible || !self.nodes[edge.target].visible {
                continue;
            }
            let src_node = &self.nodes[edge.source];
            let dst_node = &self.nodes[edge.target];

            let (sx, sy, snx, sny) = src_node
                .ports
                .get(edge.source_port)
                .map(|p| (p.x, p.y, p.nx, p.ny))
                .unwrap_or((src_node.x + HALF_W, src_node.y, 1.0, 0.0));
            let (tx, ty, tnx, tny) = dst_node
                .ports
                .get(edge.target_port)
                .map(|p| (p.x, p.y, p.nx, p.ny))
                .unwrap_or((dst_node.x - HALF_W, dst_node.y, -1.0, 0.0));

            // Frustum check for wire bounding box
            let w_min_x = sx.min(tx) - 80.0;
            let w_max_x = sx.max(tx) + 80.0;
            let w_min_y = sy.min(ty) - 80.0;
            let w_max_y = sy.max(ty) + 80.0;
            if w_max_x < ex1 || w_min_x > ex2 || w_max_y < ey1 || w_min_y > ey2 {
                continue;
            }

            let muted = src_node.muted || dst_node.muted;
            let wire_hovered = self.hovered_kind == 4 && self.hovered_node == edge_idx as i32;
            let node_hovered = self.hovered_kind != 4
                && (self.hovered_node == edge.source as i32
                    || self.hovered_node == edge.target as i32);
            let highlighted =
                src_node.selected || dst_node.selected || wire_hovered || node_hovered;
            let flagged_edge = src_node.flagged || dst_node.flagged;

            let alpha = if muted { 0.18 } else { 0.94 };
            let (base_color, dashed) = match edge.relation {
                RelationKind::InputTo | RelationKind::Produces => {
                    let c = if wire_hovered {
                        [0.02, 0.56, 0.94, 1.0]
                    } else if highlighted {
                        [0.05, 0.50, 0.82, alpha]
                    } else if flagged_edge {
                        [0.86, 0.52, 0.14, alpha]
                    } else {
                        [0.42, 0.55, 0.68, alpha]
                    };
                    (c, false)
                }
                RelationKind::AssumptionFor => (
                    if wire_hovered {
                        [0.54, 0.30, 0.94, 1.0]
                    } else {
                        [0.62, 0.42, 0.90, alpha]
                    },
                    true,
                ),
                RelationKind::Requires => (
                    if wire_hovered {
                        [0.90, 0.50, 0.08, 1.0]
                    } else {
                        [0.85, 0.58, 0.18, alpha]
                    },
                    true,
                ),
                RelationKind::ValidatedBy => {
                    let c = if flagged_edge {
                        [0.86, 0.36, 0.25, alpha]
                    } else if wire_hovered {
                        [0.08, 0.62, 0.76, 1.0]
                    } else {
                        [0.18, 0.56, 0.66, alpha]
                    };
                    (c, true)
                }
            };

            let tip_backoff = 8.5;
            let end_x = tx + tnx * tip_backoff;
            let end_y = ty + tny * tip_backoff;
            let dist = ((end_x - sx).hypot(end_y - sy)).max(24.0);
            let handle = (dist * 0.42).clamp(34.0, 150.0);
            let c1x = sx + snx * handle;
            let c1y = sy + sny * handle;
            let c2x = end_x + tnx * handle;
            let c2y = end_y + tny * handle;

            let half_width = if wire_hovered {
                2.25
            } else if highlighted {
                1.65
            } else {
                1.15
            };

            // Outer white bridge halo so crossing wires remain readable
            if !muted {
                emit_bezier_ribbon(
                    &mut self.vertices,
                    (sx, sy),
                    (c1x, c1y),
                    (c2x, c2y),
                    (end_x, end_y),
                    half_width + if wire_hovered { 2.4 } else { 1.5 },
                    if wire_hovered {
                        [0.82, 0.93, 1.0, 0.92]
                    } else {
                        [0.97, 0.99, 1.0, 0.82]
                    },
                    false,
                );
            }

            // Main wire stroke
            emit_bezier_ribbon(
                &mut self.vertices,
                (sx, sy),
                (c1x, c1y),
                (c2x, c2y),
                (end_x, end_y),
                half_width,
                base_color,
                dashed,
            );

            // Midpoint flow directional bead on active data edges
            if !dashed && !muted {
                let (mx, my) =
                    cubic_bezier_point((sx, sy), (c1x, c1y), (c2x, c2y), (end_x, end_y), 0.5);
                emit_circle(&mut self.vertices, mx, my, 2.7, base_color);
            }

            // Directional arrowhead anchored at the target port socket perimeter
            let port_radius = 5.2;
            let tip_x = tx + tnx * port_radius;
            let tip_y = ty + tny * port_radius;
            let (tan_x, tan_y) =
                cubic_bezier_tangent((sx, sy), (c1x, c1y), (c2x, c2y), (end_x, end_y), 0.96);
            let arrow_len = 8.2;
            let arrow_w = 4.3;
            let bx = tip_x - tan_x * arrow_len;
            let by = tip_y - tan_y * arrow_len;
            let px = -tan_y * arrow_w;
            let py = tan_x * arrow_w;
            emit_triangle(
                &mut self.vertices,
                (tip_x, tip_y),
                (bx + px, by + py),
                (bx - px, by - py),
                base_color,
            );
        }

        // 2. Node Cards, Vector Icons, Embedded Charts & Port Sockets
        let atlas_cols = self.atlas_cols.max(1);
        let atlas_rows = self.atlas_rows.max(1);
        let atlas_capacity = (atlas_cols * atlas_rows) as usize;

        for idx in 0..self.nodes.len() {
            if !self.nodes[idx].visible {
                continue;
            }
            let nx = self.nodes[idx].x;
            let ny = self.nodes[idx].y;
            if nx + HALF_W < ex1 || nx - HALF_W > ex2 || ny + HALF_H < ey1 || ny - HALF_H > ey2 {
                continue;
            }

            let kind = self.nodes[idx].kind;
            let flagged = self.nodes[idx].flagged;
            let selected = self.nodes[idx].selected;
            let muted = self.nodes[idx].muted;
            let is_hovered = self.hovered_node == idx as i32;
            let more_hovered = is_hovered && self.hovered_kind == 2;
            let alpha = if muted { 0.24 } else { 1.0 };

            let (border_col, bg_top, bg_bot, ink_col) =
                palette_for_node(kind, flagged, alpha, self.dark);

            // Soft drop shadow
            if !muted {
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny + 3.0,
                    HALF_W + 2.0,
                    HALF_H + 2.0,
                    if selected {
                        [0.09, 0.45, 0.78, 0.18]
                    } else {
                        [0.10, 0.24, 0.38, 0.08]
                    },
                );
            }

            let is_executing = self.nodes[idx].executing;
            // Execution, selection or hover halo
            if is_executing {
                // Electric cyan execution glow rings
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 11.0,
                    HALF_H + 11.0,
                    [0.0, 0.82, 1.0, 0.40 * alpha],
                );
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 6.0,
                    HALF_H + 6.0,
                    [0.05, 0.90, 1.0, 0.72 * alpha],
                );
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 2.5,
                    HALF_H + 2.5,
                    [0.35, 0.96, 1.0, 0.95 * alpha],
                );
            } else if selected && self.selection_halo {
                // Wide, vivid electric orange-amber glow rings
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 9.0,
                    HALF_H + 9.0,
                    [
                        self.selection_color[0],
                        self.selection_color[1],
                        self.selection_color[2],
                        0.18 * alpha,
                    ],
                );
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 5.0,
                    HALF_H + 5.0,
                    [
                        self.selection_color[0],
                        self.selection_color[1],
                        self.selection_color[2],
                        0.35 * alpha,
                    ],
                );
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 2.2,
                    HALF_H + 2.2,
                    [
                        self.selection_color[0],
                        self.selection_color[1],
                        self.selection_color[2],
                        0.75 * alpha,
                    ],
                );
            } else if is_hovered {
                emit_rounded_rect(
                    &mut self.vertices,
                    nx,
                    ny,
                    HALF_W + 2.5,
                    HALF_H + 2.5,
                    [0.24, 0.64, 0.92, 0.22 * alpha],
                );
            }

            // Outer border rounded rect (cyan on executing, vivid orange on selection)
            let effective_border = if is_executing {
                [0.0, 0.95, 1.0, 1.0]
            } else if selected {
                [
                    self.selection_color[0],
                    self.selection_color[1],
                    self.selection_color[2],
                    alpha,
                ]
            } else {
                border_col
            };
            emit_rounded_rect(&mut self.vertices, nx, ny, HALF_W, HALF_H, effective_border);

            // Inner card body (gradient top/bottom)
            emit_rounded_rect_gradient(
                &mut self.vertices,
                nx,
                ny,
                HALF_W - 1.6,
                HALF_H - 1.6,
                bg_top,
                bg_bot,
            );

            // Left category accent stripe inside card
            let effective_stripe = if is_executing {
                [0.0, 0.95, 1.0, 1.0]
            } else if selected {
                [
                    self.selection_color[0],
                    self.selection_color[1],
                    self.selection_color[2],
                    alpha,
                ]
            } else {
                border_col
            };
            emit_rounded_rect(
                &mut self.vertices,
                nx - HALF_W + 4.2,
                ny,
                2.2,
                HALF_H - 8.0,
                effective_stripe,
            );

            // Flagged dashed top/bottom warning indicators
            if flagged {
                let segs = 9;
                let span = CARD_WIDTH - 24.0;
                let start_x = nx - span * 0.5;
                for s in (0..segs).step_by(2) {
                    let sx = start_x + (s as f32 + 0.5) * (span / segs as f32);
                    emit_flat_rect(
                        &mut self.vertices,
                        sx,
                        ny - HALF_H + 1.2,
                        (span / segs as f32) * 0.45,
                        1.3,
                        [0.96, 0.78, 0.45, alpha],
                    );
                    emit_flat_rect(
                        &mut self.vertices,
                        sx,
                        ny + HALF_H - 1.2,
                        (span / segs as f32) * 0.45,
                        1.3,
                        [0.96, 0.78, 0.45, alpha],
                    );
                }
            }

            // Icon badge & vector glyph at top-left
            let icon_x = nx - HALF_W + 24.0;
            let icon_y = ny - 12.0;
            emit_rounded_rect(
                &mut self.vertices,
                icon_x,
                icon_y,
                14.0,
                14.0,
                [ink_col[0], ink_col[1], ink_col[2], 0.11 * alpha],
            );
            emit_node_icon(&mut self.vertices, kind, flagged, icon_x, icon_y, ink_col);

            // More (⋯) options button at top-right
            let more_x = nx + HALF_W - 18.0;
            let more_y = ny - HALF_H + 15.0;
            if more_hovered {
                emit_rounded_rect(
                    &mut self.vertices,
                    more_x,
                    more_y,
                    12.0,
                    9.0,
                    [0.12, 0.45, 0.68, 0.14 * alpha],
                );
            }
            let dot_col = if self.dark {
                [0.75, 0.75, 0.75, 0.85 * alpha]
            } else {
                [0.26, 0.39, 0.50, 0.85 * alpha]
            };
            for d in -1..=1 {
                emit_circle(
                    &mut self.vertices,
                    more_x + d as f32 * 4.2,
                    more_y,
                    1.4,
                    dot_col,
                );
            }

            // Embedded analytical mini-chart in the lower band of the card
            if self.zoom >= 0.35 {
                self.emit_node_chart(idx, alpha);
            }

            // Structured Port Sockets around node perimeter
            let ports_len = self.nodes[idx].ports.len();
            for p_idx in 0..ports_len {
                let port = self.nodes[idx].ports[p_idx];
                let port_hovered = is_hovered
                    && self.hovered_kind == 3
                    && (self.hovered_sub < 0 || self.hovered_sub == p_idx as i32);
                let p_col = port_color(port.kind, port.state, alpha);
                // Lead stub connecting port socket to card border
                emit_line_segment(
                    &mut self.vertices,
                    (port.x - port.nx * 3.0, port.y - port.ny * 3.0),
                    (port.x + port.nx * 3.5, port.y + port.ny * 3.5),
                    1.3,
                    p_col,
                );
                if port_hovered {
                    emit_circle(
                        &mut self.vertices,
                        port.x,
                        port.y,
                        8.4,
                        [p_col[0], p_col[1], p_col[2], 0.30 * alpha],
                    );
                }
                // White outer socket halo
                emit_circle(
                    &mut self.vertices,
                    port.x,
                    port.y,
                    if port_hovered {
                        6.4
                    } else if port.connected {
                        5.4
                    } else {
                        4.5
                    },
                    if self.dark {
                        [0.20, 0.20, 0.20, 0.96 * alpha]
                    } else {
                        [1.0, 1.0, 1.0, 0.96 * alpha]
                    },
                );
                // Colored socket ring
                emit_circle(
                    &mut self.vertices,
                    port.x,
                    port.y,
                    if port_hovered {
                        5.0
                    } else if port.connected {
                        4.1
                    } else {
                        3.3
                    },
                    p_col,
                );
                // Inner center pin
                if !port.connected {
                    emit_circle(
                        &mut self.vertices,
                        port.x,
                        port.y,
                        1.7,
                        if self.dark {
                            [0.20, 0.20, 0.20, 0.95 * alpha]
                        } else {
                            [0.96, 0.98, 1.0, 0.95 * alpha]
                        },
                    );
                }
            }

            // Text Atlas Quad for crisp typography on GPU
            if idx < atlas_capacity && self.zoom >= 0.22 {
                let col = (idx as u32) % atlas_cols;
                let row = (idx as u32) / atlas_cols;
                let u0 = col as f32 / atlas_cols as f32;
                let v0 = row as f32 / atlas_rows as f32;
                let u1 = (col + 1) as f32 / atlas_cols as f32;
                let v1 = (row + 1) as f32 / atlas_rows as f32;

                let x0 = nx - HALF_W;
                let y0 = ny - HALF_H;
                let x1 = nx + HALF_W;
                let y1 = ny + HALF_H;

                push_text_vert(&mut self.text_vertices, x0, y0, u0, v0, alpha);
                push_text_vert(&mut self.text_vertices, x1, y0, u1, v0, alpha);
                push_text_vert(&mut self.text_vertices, x1, y1, u1, v1, alpha);

                push_text_vert(&mut self.text_vertices, x0, y0, u0, v0, alpha);
                push_text_vert(&mut self.text_vertices, x1, y1, u1, v1, alpha);
                push_text_vert(&mut self.text_vertices, x0, y1, u0, v1, alpha);
            }
        }

        // 3. Live Interactive Draft Wire on GPU (when user drags a connection between ports)
        if self.draft_active {
            let sx = self.draft_sx;
            let sy = self.draft_sy;
            let tx = self.draft_tx;
            let ty = self.draft_ty;
            let dist = ((tx - sx).hypot(ty - sy)).max(24.0);
            let handle = (dist * 0.42).clamp(32.0, 140.0);
            let c1x = sx + self.draft_snx * handle;
            let c1y = sy + self.draft_sny * handle;
            let c2x = tx + self.draft_tnx * handle;
            let c2y = ty + self.draft_tny * handle;

            let wire_col = if self.draft_valid {
                [0.06, 0.68, 0.48, 0.98]
            } else {
                [0.08, 0.56, 0.94, 0.94]
            };

            emit_bezier_ribbon(
                &mut self.vertices,
                (sx, sy),
                (c1x, c1y),
                (c2x, c2y),
                (tx, ty),
                3.4,
                [1.0, 1.0, 1.0, 0.88],
                false,
            );
            emit_bezier_ribbon(
                &mut self.vertices,
                (sx, sy),
                (c1x, c1y),
                (c2x, c2y),
                (tx, ty),
                1.95,
                wire_col,
                !self.draft_valid,
            );
            emit_circle(&mut self.vertices, sx, sy, 6.2, wire_col);
            emit_circle(&mut self.vertices, sx, sy, 2.6, [1.0, 1.0, 1.0, 0.98]);

            let (tan_x, tan_y) =
                cubic_bezier_tangent((sx, sy), (c1x, c1y), (c2x, c2y), (tx, ty), 0.98);
            let arrow_len = 9.0;
            let arrow_w = 4.8;
            let bx = tx - tan_x * arrow_len;
            let by = ty - tan_y * arrow_len;
            let px = -tan_y * arrow_w;
            let py = tan_x * arrow_w;
            emit_triangle(
                &mut self.vertices,
                (tx, ty),
                (bx + px, by + py),
                (bx - px, by - py),
                wire_col,
            );
            if self.draft_valid {
                emit_circle(&mut self.vertices, tx, ty, 8.5, [0.06, 0.68, 0.48, 0.32]);
            }
        }
    }

    fn emit_node_chart(&mut self, idx: usize, alpha: f32) {
        if self.nodes[idx].chart_kind == ChartKind::None {
            return;
        }
        let nx = self.nodes[idx].x;
        let ny = self.nodes[idx].y;
        let chart_kind = self.nodes[idx].chart_kind;
        let primary = self.nodes[idx].chart_primary;
        let secondary = self.nodes[idx].chart_secondary;

        let track_left = nx - HALF_W + 14.0;
        let track_right = nx + HALF_W - 68.0;
        let track_w = (track_right - track_left).max(40.0);
        let track_cx = (track_left + track_right) * 0.5;
        let track_cy = ny + HALF_H - 13.0;
        let track_h = 3.2;

        // Track background pill
        emit_rounded_rect(
            &mut self.vertices,
            track_cx,
            track_cy,
            track_w * 0.5,
            track_h,
            if self.dark {
                [0.30, 0.30, 0.30, 0.85 * alpha]
            } else {
                [0.80, 0.87, 0.93, 0.85 * alpha]
            },
        );

        match chart_kind {
            ChartKind::None => {}
            ChartKind::Bar => {
                let ratio = primary.clamp(0.0, 1.0);
                if ratio > 0.01 {
                    let fill_w = (track_w * ratio).max(6.0);
                    let col = self.nodes[idx]
                        .chart_segments
                        .first()
                        .map(|s| s.1)
                        .unwrap_or([0.10, 0.60, 0.95, 0.9]);
                    emit_rounded_rect(
                        &mut self.vertices,
                        track_left + fill_w * 0.5,
                        track_cy,
                        fill_w * 0.5,
                        track_h,
                        [col[0], col[1], col[2], col[3] * alpha],
                    );
                } else {
                    // Missing value warning ticks
                    for t in 0..5 {
                        let tx = track_left + (t as f32 + 0.5) * (track_w / 5.0);
                        emit_flat_rect(
                            &mut self.vertices,
                            tx,
                            track_cy,
                            5.0,
                            track_h - 0.5,
                            [0.90, 0.53, 0.14, 0.75 * alpha],
                        );
                    }
                }
                // Scale reference ticks
                for tick in [0.25f32, 0.5, 0.75] {
                    emit_flat_rect(
                        &mut self.vertices,
                        track_left + track_w * tick,
                        track_cy,
                        0.6,
                        track_h + 1.2,
                        [1.0, 1.0, 1.0, 0.65 * alpha],
                    );
                }
            }
            ChartKind::Stacked => {
                let seg_count = self.nodes[idx].chart_segments.len();
                let mut cursor = track_left;
                for s_idx in 0..seg_count {
                    let (share, col) = self.nodes[idx].chart_segments[s_idx];
                    let seg_w = (track_w * share - 1.5).max(4.0);
                    if cursor + seg_w <= track_right + 2.0 {
                        emit_rounded_rect(
                            &mut self.vertices,
                            cursor + seg_w * 0.5,
                            track_cy,
                            seg_w * 0.5,
                            track_h,
                            [col[0], col[1], col[2], col[3] * alpha],
                        );
                    }
                    cursor += seg_w + 2.0;
                }
            }
            ChartKind::Gauge => {
                // Green tolerance band centered at 0.5
                let tol_half = secondary.clamp(0.08, 0.30) * track_w;
                emit_rounded_rect(
                    &mut self.vertices,
                    track_cx,
                    track_cy,
                    tol_half,
                    track_h,
                    [0.16, 0.72, 0.52, 0.42 * alpha],
                );
                // Center target line
                emit_flat_rect(
                    &mut self.vertices,
                    track_cx,
                    track_cy,
                    0.9,
                    track_h + 2.2,
                    [0.10, 0.48, 0.36, 0.90 * alpha],
                );
                // Actual measured marker & divergence bar
                let marker_x = track_left + track_w * primary.clamp(0.05, 0.95);
                let col = self.nodes[idx]
                    .chart_segments
                    .first()
                    .map(|s| s.1)
                    .unwrap_or([0.12, 0.65, 0.48, 0.95]);
                let diff = (marker_x - track_cx).abs();
                if diff > 2.0 {
                    emit_flat_rect(
                        &mut self.vertices,
                        (track_cx + marker_x) * 0.5,
                        track_cy,
                        diff * 0.5,
                        1.8,
                        [col[0], col[1], col[2], 0.85 * alpha],
                    );
                }
                emit_circle(
                    &mut self.vertices,
                    marker_x,
                    track_cy,
                    4.2,
                    [col[0], col[1], col[2], alpha],
                );
                emit_circle(
                    &mut self.vertices,
                    marker_x,
                    track_cy,
                    1.8,
                    [1.0, 1.0, 1.0, alpha],
                );
            }
            ChartKind::StatusSegments => {
                let seg_count = self.nodes[idx].chart_segments.len().max(1);
                let gap = 3.0;
                let seg_w = (track_w - gap * (seg_count as f32 - 1.0)) / seg_count as f32;
                for s_idx in 0..seg_count {
                    let (_, col) = self.nodes[idx].chart_segments[s_idx];
                    let cx = track_left + s_idx as f32 * (seg_w + gap) + seg_w * 0.5;
                    emit_rounded_rect(
                        &mut self.vertices,
                        cx,
                        track_cy,
                        seg_w * 0.5,
                        track_h,
                        [col[0], col[1], col[2], col[3] * alpha],
                    );
                }
            }
        }
    }
}

fn neighbor_barycenter(node: usize, neighbors: &[usize], y_hint: &[f32]) -> f32 {
    if neighbors.is_empty() {
        return y_hint[node];
    }
    let sum: f32 = neighbors.iter().map(|&idx| y_hint[idx]).sum();
    sum / (neighbors.len() as f32)
}

fn palette_for_node(
    kind: NodeKind,
    flagged: bool,
    alpha: f32,
    dark: bool,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    if dark {
        let (border, _, _, _) = palette_for_node(kind, flagged, alpha, false);
        let ink = [
            0.30 + border[0] * 0.70,
            0.30 + border[1] * 0.70,
            0.30 + border[2] * 0.70,
            alpha,
        ];
        return if flagged {
            (
                border,
                [0.25, 0.215, 0.165, alpha],
                [0.215, 0.185, 0.145, alpha],
                ink,
            )
        } else {
            (
                border,
                [0.205, 0.205, 0.205, alpha],
                [0.175, 0.175, 0.175, alpha],
                ink,
            )
        };
    }
    if flagged {
        return (
            [0.91, 0.56, 0.12, alpha],
            [1.00, 0.98, 0.93, alpha],
            [1.00, 0.95, 0.86, alpha],
            [0.78, 0.42, 0.06, alpha],
        );
    }
    match kind {
        NodeKind::Variable => (
            [0.10, 0.61, 1.00, alpha],
            [0.95, 0.99, 1.00, alpha],
            [0.91, 0.96, 1.00, alpha],
            [0.03, 0.50, 0.78, alpha],
        ),
        NodeKind::Equation => (
            [0.13, 0.66, 0.50, alpha],
            [0.95, 1.00, 0.97, alpha],
            [0.91, 0.98, 0.94, alpha],
            [0.03, 0.49, 0.36, alpha],
        ),
        NodeKind::Assumption => (
            [0.63, 0.43, 1.00, alpha],
            [0.98, 0.96, 1.00, alpha],
            [0.94, 0.92, 1.00, alpha],
            [0.56, 0.32, 0.91, alpha],
        ),
        NodeKind::Requirement => (
            [0.86, 0.65, 0.29, alpha],
            [1.00, 0.99, 0.95, alpha],
            [0.99, 0.96, 0.89, alpha],
            [0.69, 0.47, 0.13, alpha],
        ),
        NodeKind::Group => (
            [0.40, 0.46, 0.48, alpha],
            [0.97, 0.98, 0.98, alpha],
            [0.90, 0.94, 0.94, alpha],
            [0.23, 0.38, 0.39, alpha],
        ),
        NodeKind::Observation => (
            [0.54, 0.63, 0.74, alpha],
            [0.98, 0.99, 1.00, alpha],
            [0.93, 0.95, 0.98, alpha],
            [0.34, 0.44, 0.55, alpha],
        ),
    }
}

fn port_color(kind: PortKind, state: PortState, alpha: f32) -> [f32; 4] {
    if state == PortState::Flagged {
        return [0.91, 0.53, 0.12, alpha];
    }
    match kind {
        PortKind::Input => [0.09, 0.58, 0.94, alpha],
        PortKind::Output => [0.10, 0.64, 0.50, alpha],
        PortKind::Assumption => [0.60, 0.38, 0.92, alpha],
        PortKind::Requirement => [0.85, 0.59, 0.18, alpha],
        PortKind::Validation => [0.16, 0.55, 0.66, alpha],
    }
}

#[allow(clippy::too_many_arguments)]
fn push_vert(buf: &mut Vec<f32>, x: f32, y: f32, u: f32, v: f32, color: [f32; 4], mode: f32) {
    buf.extend_from_slice(&[x, y, u, v, color[0], color[1], color[2], color[3], mode]);
}

fn push_text_vert(buf: &mut Vec<f32>, x: f32, y: f32, u: f32, v: f32, alpha: f32) {
    buf.extend_from_slice(&[x, y, u, v, alpha]);
}

fn emit_rounded_rect(buf: &mut Vec<f32>, cx: f32, cy: f32, hw: f32, hh: f32, color: [f32; 4]) {
    emit_rounded_rect_gradient(buf, cx, cy, hw, hh, color, color);
}

fn emit_rounded_rect_gradient(
    buf: &mut Vec<f32>,
    cx: f32,
    cy: f32,
    hw: f32,
    hh: f32,
    top_col: [f32; 4],
    bot_col: [f32; 4],
) {
    let x0 = cx - hw;
    let y0 = cy - hh;
    let x1 = cx + hw;
    let y1 = cy + hh;
    push_vert(buf, x0, y0, -1.0, -1.0, top_col, 1.0);
    push_vert(buf, x1, y0, 1.0, -1.0, top_col, 1.0);
    push_vert(buf, x1, y1, 1.0, 1.0, bot_col, 1.0);

    push_vert(buf, x0, y0, -1.0, -1.0, top_col, 1.0);
    push_vert(buf, x1, y1, 1.0, 1.0, bot_col, 1.0);
    push_vert(buf, x0, y1, -1.0, 1.0, bot_col, 1.0);
}

fn emit_flat_rect(buf: &mut Vec<f32>, cx: f32, cy: f32, hw: f32, hh: f32, color: [f32; 4]) {
    let x0 = cx - hw;
    let y0 = cy - hh;
    let x1 = cx + hw;
    let y1 = cy + hh;
    push_vert(buf, x0, y0, 0.0, 0.0, color, 0.0);
    push_vert(buf, x1, y0, 0.0, 0.0, color, 0.0);
    push_vert(buf, x1, y1, 0.0, 0.0, color, 0.0);

    push_vert(buf, x0, y0, 0.0, 0.0, color, 0.0);
    push_vert(buf, x1, y1, 0.0, 0.0, color, 0.0);
    push_vert(buf, x0, y1, 0.0, 0.0, color, 0.0);
}

fn emit_circle(buf: &mut Vec<f32>, cx: f32, cy: f32, r: f32, color: [f32; 4]) {
    let x0 = cx - r;
    let y0 = cy - r;
    let x1 = cx + r;
    let y1 = cy + r;
    push_vert(buf, x0, y0, -1.0, -1.0, color, 2.0);
    push_vert(buf, x1, y0, 1.0, -1.0, color, 2.0);
    push_vert(buf, x1, y1, 1.0, 1.0, color, 2.0);

    push_vert(buf, x0, y0, -1.0, -1.0, color, 2.0);
    push_vert(buf, x1, y1, 1.0, 1.0, color, 2.0);
    push_vert(buf, x0, y1, -1.0, 1.0, color, 2.0);
}

fn emit_triangle(buf: &mut Vec<f32>, a: (f32, f32), b: (f32, f32), c: (f32, f32), color: [f32; 4]) {
    push_vert(buf, a.0, a.1, 0.0, 0.0, color, 0.0);
    push_vert(buf, b.0, b.1, 0.0, 0.0, color, 0.0);
    push_vert(buf, c.0, c.1, 0.0, 0.0, color, 0.0);
}

fn emit_line_segment(
    buf: &mut Vec<f32>,
    p0: (f32, f32),
    p1: (f32, f32),
    half_w: f32,
    color: [f32; 4],
) {
    let dx = p1.0 - p0.0;
    let dy = p1.1 - p0.1;
    let len = dx.hypot(dy);
    if len <= 1e-4 {
        return;
    }
    let nx = -dy / len * half_w;
    let ny = dx / len * half_w;

    push_vert(buf, p0.0 + nx, p0.1 + ny, 0.0, -1.0, color, 0.0);
    push_vert(buf, p1.0 + nx, p1.1 + ny, 1.0, -1.0, color, 0.0);
    push_vert(buf, p1.0 - nx, p1.1 - ny, 1.0, 1.0, color, 0.0);

    push_vert(buf, p0.0 + nx, p0.1 + ny, 0.0, -1.0, color, 0.0);
    push_vert(buf, p1.0 - nx, p1.1 - ny, 1.0, 1.0, color, 0.0);
    push_vert(buf, p0.0 - nx, p0.1 - ny, 0.0, 1.0, color, 0.0);
}

fn emit_node_icon(
    buf: &mut Vec<f32>,
    kind: NodeKind,
    flagged: bool,
    cx: f32,
    cy: f32,
    col: [f32; 4],
) {
    let w = 1.1;
    if flagged && kind == NodeKind::Requirement {
        // Warning triangle
        emit_line_segment(buf, (cx, cy - 6.5), (cx + 6.5, cy + 5.5), w, col);
        emit_line_segment(buf, (cx + 6.5, cy + 5.5), (cx - 6.5, cy + 5.5), w, col);
        emit_line_segment(buf, (cx - 6.5, cy + 5.5), (cx, cy - 6.5), w, col);
        emit_line_segment(buf, (cx, cy - 2.0), (cx, cy + 1.8), w, col);
        emit_circle(buf, cx, cy + 3.8, 1.2, col);
        return;
    }
    match kind {
        NodeKind::Variable => {
            // Sigma (Σ)
            emit_line_segment(buf, (cx + 5.0, cy - 6.0), (cx - 5.0, cy - 6.0), w, col);
            emit_line_segment(buf, (cx - 5.0, cy - 6.0), (cx + 1.5, cy), w, col);
            emit_line_segment(buf, (cx + 1.5, cy), (cx - 5.0, cy + 6.0), w, col);
            emit_line_segment(buf, (cx - 5.0, cy + 6.0), (cx + 5.0, cy + 6.0), w, col);
        }
        NodeKind::Equation => {
            // Function / Formula symbol
            emit_line_segment(buf, (cx - 2.5, cy + 6.0), (cx + 0.5, cy - 5.5), w, col);
            emit_line_segment(buf, (cx + 0.5, cy - 5.5), (cx + 4.5, cy - 5.5), w, col);
            emit_line_segment(buf, (cx - 4.5, cy - 0.5), (cx + 3.0, cy - 0.5), w, col);
        }
        NodeKind::Assumption => {
            // Document / Hypothesis lines
            emit_line_segment(buf, (cx - 4.8, cy - 4.5), (cx + 4.8, cy - 4.5), w, col);
            emit_line_segment(buf, (cx - 4.8, cy), (cx + 4.8, cy), w, col);
            emit_line_segment(buf, (cx - 4.8, cy + 4.5), (cx + 1.8, cy + 4.5), w, col);
        }
        NodeKind::Requirement => {
            // Alert / Check triangle
            emit_line_segment(buf, (cx, cy - 6.5), (cx + 6.5, cy + 5.5), w, col);
            emit_line_segment(buf, (cx + 6.5, cy + 5.5), (cx - 6.5, cy + 5.5), w, col);
            emit_line_segment(buf, (cx - 6.5, cy + 5.5), (cx, cy - 6.5), w, col);
            emit_line_segment(buf, (cx, cy - 2.0), (cx, cy + 1.8), w, col);
            emit_circle(buf, cx, cy + 3.8, 1.2, col);
        }
        NodeKind::Group => {
            for offset in [-4.0, 2.0] {
                emit_line_segment(
                    buf,
                    (cx - 6.0, cy + offset),
                    (cx, cy + offset - 3.0),
                    w,
                    col,
                );
                emit_line_segment(
                    buf,
                    (cx, cy + offset - 3.0),
                    (cx + 6.0, cy + offset),
                    w,
                    col,
                );
                emit_line_segment(
                    buf,
                    (cx + 6.0, cy + offset),
                    (cx, cy + offset + 3.0),
                    w,
                    col,
                );
                emit_line_segment(
                    buf,
                    (cx, cy + offset + 3.0),
                    (cx - 6.0, cy + offset),
                    w,
                    col,
                );
            }
        }
        NodeKind::Observation => {
            // Target / Empirical reference
            emit_circle(buf, cx, cy, 5.5, [col[0], col[1], col[2], col[3] * 0.35]);
            emit_circle(buf, cx, cy, 2.5, col);
        }
    }
}

fn cubic_bezier_point(
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    t: f32,
) -> (f32, f32) {
    let u = 1.0 - t;
    let tt = t * t;
    let uu = u * u;
    let uuu = uu * u;
    let ttt = tt * t;
    let x = uuu * p0.0 + 3.0 * uu * t * p1.0 + 3.0 * u * tt * p2.0 + ttt * p3.0;
    let y = uuu * p0.1 + 3.0 * uu * t * p1.1 + 3.0 * u * tt * p2.1 + ttt * p3.1;
    (x, y)
}

fn cubic_bezier_tangent(
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    t: f32,
) -> (f32, f32) {
    let u = 1.0 - t;
    let dx =
        3.0 * u * u * (p1.0 - p0.0) + 6.0 * u * t * (p2.0 - p1.0) + 3.0 * t * t * (p3.0 - p2.0);
    let dy =
        3.0 * u * u * (p1.1 - p0.1) + 6.0 * u * t * (p2.1 - p1.1) + 3.0 * t * t * (p3.1 - p2.1);
    let len = dx.hypot(dy).max(1e-5);
    (dx / len, dy / len)
}

#[allow(clippy::too_many_arguments)]
fn emit_bezier_ribbon(
    buf: &mut Vec<f32>,
    p0: (f32, f32),
    p1: (f32, f32),
    p2: (f32, f32),
    p3: (f32, f32),
    half_w: f32,
    color: [f32; 4],
    dashed: bool,
) {
    let steps = 22usize;
    let mut prev = p0;
    let mut accum_len = 0.0f32;

    for i in 1..=steps {
        let t = i as f32 / steps as f32;
        let curr = cubic_bezier_point(p0, p1, p2, p3, t);
        let seg_len = (curr.0 - prev.0).hypot(curr.1 - prev.1);
        let draw = if dashed {
            let phase = (accum_len + seg_len * 0.5) % 13.0;
            phase < 7.5
        } else {
            true
        };
        if draw {
            emit_line_segment(buf, prev, curr, half_w, color);
        }
        accum_len += seg_len;
        prev = curr;
    }
}

// ============================================================================
// WebAssembly C-ABI Exports
// ============================================================================

#[no_mangle]
pub extern "C" fn vp_new() -> *mut ViewportEngine {
    Box::into_raw(Box::new(ViewportEngine::new()))
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_free(ptr: *mut ViewportEngine) {
    if !ptr.is_null() {
        drop(Box::from_raw(ptr));
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_begin_model(
    ptr: *mut ViewportEngine,
    node_count: usize,
    edge_count: usize,
    preserve_positions: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.begin_model(node_count, edge_count, preserve_positions != 0);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_set_node(
    ptr: *mut ViewportEngine,
    index: usize,
    kind: u32,
    is_derived: u32,
    has_value: u32,
    value: f64,
    ref_value: f64,
    tolerance: f64,
    flagged: u32,
    visible: u32,
    muted: u32,
    selected: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.set_node(
            index,
            kind,
            is_derived != 0,
            has_value != 0,
            value,
            ref_value,
            tolerance,
            flagged != 0,
            visible != 0,
            muted != 0,
            selected != 0,
        );
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_update_node_state(
    ptr: *mut ViewportEngine,
    index: usize,
    is_derived: u32,
    has_value: u32,
    value: f64,
    ref_value: f64,
    tolerance: f64,
    flagged: u32,
    visible: u32,
    muted: u32,
    selected: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.update_node_state(
            index,
            is_derived != 0,
            has_value != 0,
            value,
            ref_value,
            tolerance,
            flagged != 0,
            visible != 0,
            muted != 0,
            selected != 0,
        );
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_set_executing_node(ptr: *mut ViewportEngine, index: i32) {
    if let Some(engine) = ptr.as_mut() {
        engine.set_executing_node(index);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_add_edge(
    ptr: *mut ViewportEngine,
    source: usize,
    target: usize,
    relation: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.add_edge(source, target, relation);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_finish_model(ptr: *mut ViewportEngine, run_layout: u32) {
    if let Some(engine) = ptr.as_mut() {
        engine.finish_model(run_layout != 0);
    }
}

/// Change presentation only: scientific data, layout, ports and camera are untouched.
/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_set_appearance(
    ptr: *mut ViewportEngine,
    dark: u32,
    r: f32,
    g: f32,
    b: f32,
    halo: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.dark = dark != 0;
        engine.selection_halo = halo != 0;
        if [r, g, b].iter().all(|v| v.is_finite()) {
            engine.selection_color = [r.clamp(0.0, 1.0), g.clamp(0.0, 1.0), b.clamp(0.0, 1.0)];
        }
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_refresh_state(ptr: *mut ViewportEngine) {
    if let Some(engine) = ptr.as_mut() {
        engine.rebuild_ports();
        engine.recompute_charts();
        engine.update_metrics();
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_arrange(ptr: *mut ViewportEngine) {
    if let Some(engine) = ptr.as_mut() {
        engine.arrange();
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_resize(ptr: *mut ViewportEngine, width: f32, height: f32, dpr: f32) {
    if let Some(engine) = ptr.as_mut() {
        engine.resize(width, height, dpr);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_fit_all(ptr: *mut ViewportEngine) {
    if let Some(engine) = ptr.as_mut() {
        engine.fit_all();
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_focus_node(ptr: *mut ViewportEngine, index: usize) {
    if let Some(engine) = ptr.as_mut() {
        engine.focus_node(index);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_zoom_at(
    ptr: *mut ViewportEngine,
    target_zoom: f32,
    screen_x: f32,
    screen_y: f32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.zoom_at(target_zoom, screen_x, screen_y);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_pan_by(ptr: *mut ViewportEngine, dx: f32, dy: f32) {
    if let Some(engine) = ptr.as_mut() {
        engine.pan_by(dx, dy);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_center_on_world(ptr: *mut ViewportEngine, wx: f32, wy: f32) {
    if let Some(engine) = ptr.as_mut() {
        engine.center_on_world(wx, wy);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_move_node(
    ptr: *mut ViewportEngine,
    index: usize,
    world_x: f32,
    world_y: f32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.move_node(index, world_x, world_y);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_set_hovered(
    ptr: *mut ViewportEngine,
    node_index: i32,
    hover_kind: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.hovered_node = node_index;
        engine.hovered_kind = hover_kind;
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_set_hovered_sub(ptr: *mut ViewportEngine, sub_index: i32) {
    if let Some(engine) = ptr.as_mut() {
        engine.hovered_sub = sub_index;
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_hit_test(
    ptr: *const ViewportEngine,
    screen_x: f32,
    screen_y: f32,
) -> u32 {
    ptr.as_ref()
        .map(|engine| engine.hit_test(screen_x, screen_y))
        .unwrap_or(0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_hit_port_index(
    ptr: *const ViewportEngine,
    screen_x: f32,
    screen_y: f32,
) -> i32 {
    ptr.as_ref()
        .map(|engine| engine.hit_port_index(screen_x, screen_y))
        .unwrap_or(-1)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn vp_set_draft_wire(
    ptr: *mut ViewportEngine,
    sx: f32,
    sy: f32,
    snx: f32,
    sny: f32,
    tx: f32,
    ty: f32,
    tnx: f32,
    tny: f32,
    valid: u32,
) {
    if let Some(engine) = ptr.as_mut() {
        engine.set_draft_wire(sx, sy, snx, sny, tx, ty, tnx, tny, valid != 0);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_clear_draft_wire(ptr: *mut ViewportEngine) {
    if let Some(engine) = ptr.as_mut() {
        engine.clear_draft_wire();
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_kind(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> u32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| port.kind as u32)
        .unwrap_or(0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_x(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| port.x)
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_y(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| port.y)
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_nx(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| port.nx)
        .unwrap_or(1.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_ny(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| port.ny)
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_port_connected(
    ptr: *const ViewportEngine,
    node_index: usize,
    port_index: usize,
) -> u32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(node_index))
        .and_then(|node| node.ports.get(port_index))
        .map(|port| u32::from(port.connected))
        .unwrap_or(0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_edge_screen_x(ptr: *const ViewportEngine, edge_index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| {
            let (p0, p1, p2, p3, _) = engine.edge_curve(edge_index)?;
            let (mx, _) = cubic_bezier_point(p0, p1, p2, p3, 0.5);
            Some(mx * engine.zoom + engine.pan_x)
        })
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_edge_screen_y(ptr: *const ViewportEngine, edge_index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| {
            let (p0, p1, p2, p3, _) = engine.edge_curve(edge_index)?;
            let (_, my) = cubic_bezier_point(p0, p1, p2, p3, 0.5);
            Some(my * engine.zoom + engine.pan_y)
        })
        .unwrap_or(0.0)
}

fn dist_to_segment_sq(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let abx = b.0 - a.0;
    let aby = b.1 - a.1;
    let len_sq = abx * abx + aby * aby;
    if len_sq <= 1e-6 {
        let dx = p.0 - a.0;
        let dy = p.1 - a.1;
        return dx * dx + dy * dy;
    }
    let t = (((p.0 - a.0) * abx + (p.1 - a.1) * aby) / len_sq).clamp(0.0, 1.0);
    let cx = a.0 + abx * t;
    let cy = a.1 + aby * t;
    let dx = p.0 - cx;
    let dy = p.1 - cy;
    dx * dx + dy * dy
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_configure_atlas(ptr: *mut ViewportEngine, cols: u32, rows: u32) {
    if let Some(engine) = ptr.as_mut() {
        engine.configure_atlas(cols, rows);
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_build_frame(ptr: *mut ViewportEngine) {
    if let Some(engine) = ptr.as_mut() {
        engine.build_frame();
    }
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_vertices_ptr(ptr: *const ViewportEngine) -> *const f32 {
    ptr.as_ref()
        .map(|engine| engine.vertices.as_ptr())
        .unwrap_or(std::ptr::null())
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_vertices_len(ptr: *const ViewportEngine) -> usize {
    ptr.as_ref()
        .map(|engine| engine.vertices.len())
        .unwrap_or(0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_text_vertices_ptr(ptr: *const ViewportEngine) -> *const f32 {
    ptr.as_ref()
        .map(|engine| engine.text_vertices.as_ptr())
        .unwrap_or(std::ptr::null())
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_text_vertices_len(ptr: *const ViewportEngine) -> usize {
    ptr.as_ref()
        .map(|engine| engine.text_vertices.len())
        .unwrap_or(0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_metrics_ptr(ptr: *const ViewportEngine) -> *const f32 {
    ptr.as_ref()
        .map(|engine| engine.metrics.as_ptr())
        .unwrap_or(std::ptr::null())
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_zoom(ptr: *const ViewportEngine) -> f32 {
    ptr.as_ref().map(|engine| engine.zoom).unwrap_or(1.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_pan_x(ptr: *const ViewportEngine) -> f32 {
    ptr.as_ref().map(|engine| engine.pan_x).unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_pan_y(ptr: *const ViewportEngine) -> f32 {
    ptr.as_ref().map(|engine| engine.pan_y).unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_node_x(ptr: *const ViewportEngine, index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(index))
        .map(|n| n.x)
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_node_y(ptr: *const ViewportEngine, index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(index))
        .map(|n| n.y)
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_node_screen_x(ptr: *const ViewportEngine, index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| {
            engine
                .nodes
                .get(index)
                .map(|n| n.x * engine.zoom + engine.pan_x)
        })
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_node_screen_y(ptr: *const ViewportEngine, index: usize) -> f32 {
    ptr.as_ref()
        .and_then(|engine| {
            engine
                .nodes
                .get(index)
                .map(|n| n.y * engine.zoom + engine.pan_y)
        })
        .unwrap_or(0.0)
}

/// # Safety
/// `ptr` must be a valid pointer returned by `vp_new`.
#[no_mangle]
pub unsafe extern "C" fn vp_node_port_count(ptr: *const ViewportEngine, index: usize) -> usize {
    ptr.as_ref()
        .and_then(|engine| engine.nodes.get(index))
        .map(|n| n.ports.len())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn appearance_changes_gpu_surfaces_without_changing_the_graph_or_camera() {
        let mut engine = ViewportEngine::new();
        engine.begin_model(1, 0, false);
        engine.set_node(0, 0, false, true, 1.0, 0.0, 0.0, false, true, false, true);
        engine.finish_model(true);
        engine.build_frame();
        let camera = (engine.zoom, engine.pan_x, engine.pan_y);
        let position = (engine.nodes[0].x, engine.nodes[0].y);
        let light = engine.vertices.clone();
        unsafe {
            vp_set_appearance(&mut engine, 1, 0.2, 0.8, 0.4, 0);
        }
        engine.build_frame();
        assert_eq!(camera, (engine.zoom, engine.pan_x, engine.pan_y));
        assert_eq!(position, (engine.nodes[0].x, engine.nodes[0].y));
        assert_eq!(engine.nodes[0].value, 1.0);
        assert_ne!(light, engine.vertices);
        assert!(engine
            .vertices
            .chunks_exact(FLOATS_PER_VERTEX)
            .any(|v| v[4..7] == [0.2, 0.8, 0.4]));
        for kind in [
            NodeKind::Variable,
            NodeKind::Equation,
            NodeKind::Assumption,
            NodeKind::Requirement,
            NodeKind::Observation,
        ] {
            let (_, top, bottom, _) = palette_for_node(kind, false, 1.0, true);
            assert_eq!(top[0], top[1]);
            assert_eq!(top[1], top[2]);
            assert!(top[0] < 0.3 && bottom[0] < 0.3);
        }
        unsafe {
            vp_set_appearance(&mut engine, 0, 0.2, 0.8, 0.4, 0);
        }
        engine.build_frame();
        assert_eq!(camera, (engine.zoom, engine.pan_x, engine.pan_y));
    }

    #[test]
    fn organizes_typed_ports_and_embedded_charts_for_thermal_graph() {
        let mut engine = ViewportEngine::new();
        engine.resize(1200.0, 800.0, 1.0);
        // 0: U (var), 1: A (var), 2: dT (var), 3: steady (assumption),
        // 4: req_trans (requirement), 5: eq_trans (equation), 6: P_trans (var), 7: obs (observation)
        engine.begin_model(8, 7, false);
        engine.set_node(0, 0, false, true, 0.5, 0.0, 0.0, false, true, false, false);
        engine.set_node(
            1, 0, false, true, 100.0, 0.0, 0.0, false, true, false, false,
        );
        engine.set_node(2, 0, false, true, 20.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(3, 2, false, false, 0.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(4, 3, false, false, 0.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(5, 1, false, false, 0.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(
            6, 0, true, true, 1000.0, 0.0, 0.0, false, true, false, false,
        );
        engine.set_node(
            7, 4, false, true, 1000.0, 1000.0, 50.0, false, true, false, false,
        );

        engine.add_edge(0, 5, RelationKind::InputTo as u32);
        engine.add_edge(1, 5, RelationKind::InputTo as u32);
        engine.add_edge(2, 5, RelationKind::InputTo as u32);
        engine.add_edge(3, 5, RelationKind::AssumptionFor as u32);
        engine.add_edge(4, 5, RelationKind::Requires as u32);
        engine.add_edge(5, 6, RelationKind::Produces as u32);
        engine.add_edge(6, 7, RelationKind::ValidatedBy as u32);

        engine.finish_model(true);
        engine.build_frame();

        let eq = &engine.nodes[5];
        // Equation must have 3 Input ports (left), 1 Output port (right),
        // 1 Assumption port (top), and 1 Requirement port (bottom).
        let input_ports: Vec<&Port> = eq
            .ports
            .iter()
            .filter(|p| p.kind == PortKind::Input)
            .collect();
        let output_ports: Vec<&Port> = eq
            .ports
            .iter()
            .filter(|p| p.kind == PortKind::Output)
            .collect();
        let assump_ports: Vec<&Port> = eq
            .ports
            .iter()
            .filter(|p| p.kind == PortKind::Assumption)
            .collect();
        let req_ports: Vec<&Port> = eq
            .ports
            .iter()
            .filter(|p| p.kind == PortKind::Requirement)
            .collect();

        assert_eq!(input_ports.len(), 3);
        assert_eq!(output_ports.len(), 1);
        assert_eq!(assump_ports.len(), 1);
        assert_eq!(req_ports.len(), 1);

        // Input ports are strictly ordered top-to-bottom along left border
        assert!(input_ports[0].y < input_ports[1].y);
        assert!(input_ports[1].y < input_ports[2].y);
        assert_eq!(assump_ports[0].ny, -1.0);
        assert_eq!(req_ports[0].ny, 1.0);

        // No empirical gauge can be inferred from raw, potentially incompatible units.
        assert_eq!(engine.nodes[7].chart_kind, ChartKind::None);
        assert_eq!(engine.nodes[3].chart_kind, ChartKind::None);
        assert_eq!(engine.nodes[5].chart_segments.len(), 3);
        assert!(engine.nodes[5]
            .chart_segments
            .iter()
            .all(|s| (s.0 - 1.0 / 3.0).abs() < 1e-4));
        assert!(!engine.vertices.is_empty());
        assert_eq!(engine.vertices.len() % FLOATS_PER_VERTEX, 0);
    }

    #[test]
    fn hit_tests_node_body_and_more_button_precisely() {
        let mut engine = ViewportEngine::new();
        engine.resize(1000.0, 700.0, 1.0);
        engine.begin_model(1, 0, false);
        engine.set_node(0, 0, false, true, 42.0, 0.0, 0.0, false, true, false, false);
        engine.finish_model(true);

        let sx = engine.nodes[0].x * engine.zoom + engine.pan_x;
        let sy = engine.nodes[0].y * engine.zoom + engine.pan_y;
        let body_hit = engine.hit_test(sx, sy);
        assert_eq!(body_hit & 0xFF, 1);
        assert_eq!(body_hit >> 8, 0);

        let more_sx = (engine.nodes[0].x + HALF_W - 18.0) * engine.zoom + engine.pan_x;
        let more_sy = (engine.nodes[0].y - HALF_H + 16.0) * engine.zoom + engine.pan_y;
        let more_hit = engine.hit_test(more_sx, more_sy);
        assert_eq!(more_hit & 0xFF, 2);
        assert_eq!(more_hit >> 8, 0);
    }

    #[test]
    fn constructs_thousand_node_buffers_and_two_thousand_edges() {
        let mut engine = ViewportEngine::new();
        engine.resize(1440.0, 900.0, 1.0);
        let node_count = 1_000;
        let edge_count = 2_000;

        let t0 = Instant::now();
        engine.begin_model(node_count, edge_count, false);
        for i in 0..node_count {
            let kind = (i % 5) as u32;
            engine.set_node(
                i,
                kind,
                i % 3 == 0,
                true,
                (i as f64) * 1.5 + 10.0,
                100.0,
                10.0,
                i % 17 == 0,
                true,
                false,
                i == 0,
            );
        }
        for e in 0..edge_count {
            let src = e % (node_count - 1);
            let dst = (src + 1 + (e / node_count)) % node_count;
            if src < dst {
                engine.add_edge(src, dst, (e % 5) as u32);
            }
        }
        engine.finish_model(true);
        let layout_ms = t0.elapsed().as_secs_f64() * 1000.0;

        let t1 = Instant::now();
        engine.build_frame();
        let frame_ms = t1.elapsed().as_secs_f64() * 1000.0;

        assert!(engine.vertices.len() > 10_000);
        assert!(
            layout_ms < 250.0,
            "Layout for 1000 nodes took too long: {layout_ms:.2} ms"
        );
        assert!(
            frame_ms < 50.0,
            "Frame build for 1000 nodes took too long: {frame_ms:.2} ms"
        );
    }

    #[test]
    fn connected_socket_resolves_its_exact_edge() {
        let mut engine = ViewportEngine::new();
        engine.begin_model(3, 2, false);
        engine.set_node(0, 0, false, true, 10.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(1, 0, false, true, 20.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(2, 1, false, false, 0.0, 0.0, 0.0, false, true, false, false);
        engine.add_edge(0, 2, RelationKind::InputTo as u32);
        engine.add_edge(1, 2, RelationKind::InputTo as u32);
        engine.finish_model(true);
        let second = engine.edges[1].target_port;
        let ptr = &engine as *const ViewportEngine;
        assert_eq!(unsafe { vp_port_edge_index(ptr, 2, second as u32) }, 1);
        let empty = engine.nodes[2]
            .ports
            .iter()
            .position(|p| !p.connected)
            .unwrap();
        assert_eq!(unsafe { vp_port_edge_index(ptr, 2, empty as u32) }, -1);
    }

    #[test]
    fn hit_tests_wires_and_renders_live_draft_wire() {
        let mut engine = ViewportEngine::new();
        engine.resize(1200.0, 800.0, 1.0);
        engine.begin_model(2, 1, false);
        engine.set_node(0, 0, false, true, 10.0, 0.0, 0.0, false, true, false, false);
        engine.set_node(1, 1, false, false, 0.0, 0.0, 0.0, false, true, false, false);
        engine.add_edge(0, 1, RelationKind::InputTo as u32);
        engine.finish_model(true);

        let ptr = &mut engine as *mut ViewportEngine;
        let mid_sx = unsafe { vp_edge_screen_x(ptr, 0) };
        let mid_sy = unsafe { vp_edge_screen_y(ptr, 0) };
        let wire_hit = engine.hit_test(mid_sx, mid_sy);
        assert_eq!(wire_hit & 0xFF, 4);
        assert_eq!(wire_hit >> 8, 0);

        engine.build_frame();
        let base_verts = engine.vertices.len();
        engine.set_draft_wire(0.0, 0.0, 1.0, 0.0, 300.0, 120.0, -1.0, 0.0, true);
        engine.build_frame();
        assert!(engine.vertices.len() > base_verts);
    }
}

/// The exact edge attached to a socket, never the first incident edge on a node.
#[no_mangle]
pub unsafe extern "C" fn vp_port_edge_index(
    ptr: *const ViewportEngine,
    node_index: u32,
    port_index: u32,
) -> i32 {
    let Some(engine) = ptr.as_ref() else {
        return -1;
    };
    engine
        .edges
        .iter()
        .position(|e| {
            (e.source == node_index as usize && e.source_port == port_index as usize)
                || (e.target == node_index as usize && e.target_port == port_index as usize)
        })
        .map(|i| i as i32)
        .unwrap_or(-1)
}
