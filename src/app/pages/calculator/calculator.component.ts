import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data.service';
import { CalculatorState, Magnitude, Presentation, PromoType, Unit } from '../../models/product';
import { DEFAULT_UNIT, UNITS_BY_MAGNITUDE, PresentationResult, compare } from '../../utils/unit-price';

const MIN_PRESENTATIONS = 2;
const MAX_PRESENTATIONS = 6;

// Unidad de referencia del precio normalizado
const BASE_UNIT: Record<Magnitude, string> = {
  peso:     'kg',
  volumen:  'l',
  unidades: 'u',
};

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calculator.component.html'
})
export class CalculatorComponent implements OnInit {
  state!: CalculatorState;
  results: Record<string, PresentationResult | undefined> = {};

  readonly magnitudes: { value: Magnitude; icon: string; label: string }[] = [
    { value: 'peso',     icon: '⚖️', label: 'Peso'     },
    { value: 'volumen',  icon: '🧴', label: 'Volumen'  },
    { value: 'unidades', icon: '📦', label: 'Unidades' },
  ];

  readonly promoTypes: { value: PromoType; label: string }[] = [
    { value: 'ninguna',   label: 'Sin promoción'         },
    { value: 'nxm',       label: 'Llevá N, pagá M (3x2)' },
    { value: 'enesima',   label: '% en la N-ésima unidad' },
    { value: 'descuento', label: '% de descuento'        },
  ];

  constructor(private data: DataService) {}

  ngOnInit() {
    // Copia propia: ngModel muta el estado y no debe tocar el del servicio
    this.state = structuredClone(this.data.getCalculator());
    this.recalculate();
  }

  get units(): Unit[] {
    return UNITS_BY_MAGNITUDE[this.state.magnitude];
  }

  get baseUnit(): string {
    return BASE_UNIT[this.state.magnitude];
  }

  get canAdd()    { return this.state.presentations.length < MAX_PRESENTATIONS; }
  get canRemove() { return this.state.presentations.length > MIN_PRESENTATIONS; }

  // ── Formulario ────────────────────────────────────────────
  setMagnitude(magnitude: Magnitude) {
    if (magnitude === this.state.magnitude) return;
    const unit = DEFAULT_UNIT[magnitude];
    this.state.magnitude = magnitude;
    this.state.presentations = this.state.presentations.map(p => ({ ...p, unit }));
    this.save();
  }

  addPresentation() {
    if (!this.canAdd) return;
    this.state.presentations = [...this.state.presentations, {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      label: '',
      price: null,
      quantity: null,
      unit: DEFAULT_UNIT[this.state.magnitude],
      promo: { type: 'ninguna', take: null, pay: null, nth: null, percent: null }
    }];
    this.save();
  }

  removePresentation(id: string) {
    if (!this.canRemove) return;
    this.state.presentations = this.state.presentations.filter(p => p.id !== id);
    this.save();
  }

  save() {
    this.data.saveCalculator(structuredClone(this.state));
    this.recalculate();
  }

  reset() {
    this.data.resetCalculator();
    this.state = structuredClone(this.data.getCalculator());
    this.recalculate();
  }

  // ── Resultados ────────────────────────────────────────────
  private recalculate() {
    this.results = {};
    for (const r of compare(this.state.presentations)) {
      this.results[r.id] = r;
    }
  }

  trackById(_: number, p: Presentation) {
    return p.id;
  }
}
