package com.hranalytics.hrbackend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.OptionalDouble;
import org.junit.jupiter.api.Test;

class PerformanceScoreCalculatorTest {

    @Test
    void computeComposite_withAllComponents_returnsWeightedAverageOnScale0To100() {
        OptionalDouble score = PerformanceScoreCalculator.computeComposite(90.0, 4, 80.0);

        assertTrue(score.isPresent());
        assertEquals(84.0, score.getAsDouble(), 0.01);
    }

    @Test
    void computeComposite_withoutEvaluation_redistributesWeights() {
        OptionalDouble score = PerformanceScoreCalculator.computeComposite(90.0, null, 90.0);

        assertTrue(score.isPresent());
        assertEquals(90.0, score.getAsDouble(), 0.01);
    }

    @Test
    void computeComposite_withoutAnyComponent_returnsEmpty() {
        assertFalse(PerformanceScoreCalculator.computeComposite(null, null, null).isPresent());
    }

    @Test
    void normalizedRating_scalesOneToFiveToHundred() {
        assertEquals(80.0, PerformanceScoreCalculator.normalizedRating(4));
        assertEquals(75.0, PerformanceScoreCalculator.normalizedRating(75));
    }
}
