import { describe, it, expect } from 'vitest';
import { selectTopCategories } from '../category-breakdown';

describe('selectTopCategories', () => {
  it('devuelve vacio cuando no hay gasto', () => {
    const r = selectTopCategories([], 0);
    expect(r.top).toEqual([]);
    expect(r.rest).toEqual([]);
    expect(r.restTotal).toBe(0);
  });

  it('devuelve vacio cuando totalExpenses <= 0', () => {
    const r = selectTopCategories([{ category: 'a', total: 10 }], 0);
    expect(r.top).toEqual([]);
  });

  it('filtra categorias con total 0 o negativo', () => {
    const r = selectTopCategories(
      [
        { category: 'a', total: 10 },
        { category: 'b', total: 0 },
        { category: 'c', total: -5 },
      ],
      10,
    );
    expect(r.top.map((c) => c.category)).toEqual(['a']);
  });

  it('ordena top desc y calcula porcentajes', () => {
    const data = [
      { category: 'a', total: 10 },
      { category: 'b', total: 50 },
      { category: 'c', total: 30 },
      { category: 'd', total: 5 },
      { category: 'e', total: 20 },
      { category: 'f', total: 15 },
    ];
    const r = selectTopCategories(data, 130, 5);
    expect(r.top.map((c) => c.category)).toEqual(['b', 'c', 'e', 'f', 'a']);
    expect(r.top[0].pct).toBe(Math.round((50 / 130) * 100));
    expect(r.rest).toEqual([{ category: 'd', total: 5 }]);
    expect(r.restTotal).toBe(5);
  });

  it('rest vacio cuando hay menos de topN categorias', () => {
    const r = selectTopCategories(
      [
        { category: 'a', total: 10 },
        { category: 'b', total: 5 },
      ],
      15,
      5,
    );
    expect(r.rest).toEqual([]);
    expect(r.restTotal).toBe(0);
  });
});
