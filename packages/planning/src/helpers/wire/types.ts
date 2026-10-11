import type { Sort } from '@owlmeans/resource'
import type {
  RelationshipQuery, RelationshipQueryWire, SpecificationQuery, SpecificationQueryWire, SummaryQuery, SummaryQueryWire,
  TransitionQuery, TransitionQueryWire, WorkcardQuery, WorkcardQueryWire,
} from '../../types.js'

/**
 * The query objects to and from the shape they travel in a URL (`*QueryWire`): a list is
 * comma-joined (JSON when an element holds a comma), an object is JSON, a sort is `field,-field`.
 * Every decoder also accepts the rich form.
 */
export interface WireHelper {
  /** A list as one query value: comma-joined, or JSON when an element itself holds a comma. */
  encodeList: (value?: string | readonly string[] | null) => string | undefined
  /** Every entry of a list query value, whatever shape the transport left it in. */
  decodeList: (value: unknown, key?: string) => string[] | undefined
  /** `[{ field: 'order' }, { field: 'updatedAt', order: 'desc' }]` ⇄ `order,-updatedAt`. */
  encodeSort: <T>(sort?: Sort<T>[] | null) => string | undefined
  decodeSort: <T>(value: unknown) => Sort<T>[] | undefined
  encodeWorkcardQuery: (query?: WorkcardQuery | null) => WorkcardQueryWire
  /** @throws {PlanningError} `malformed:query:<key>` for a value that does not decode */
  decodeWorkcardQuery: (wire?: WorkcardQueryWire | WorkcardQuery | null) => WorkcardQuery
  encodeSummaryQuery: (query: SummaryQuery) => SummaryQueryWire
  decodeSummaryQuery: (wire?: SummaryQueryWire | SummaryQuery | null) => SummaryQuery
  encodeTransitionQuery: (query?: TransitionQuery | null) => TransitionQueryWire
  decodeTransitionQuery: (wire?: TransitionQueryWire | TransitionQuery | null) => TransitionQuery
  encodeSpecificationQuery: (query?: SpecificationQuery | null) => SpecificationQueryWire
  decodeSpecificationQuery: (wire?: SpecificationQueryWire | SpecificationQuery | null) => SpecificationQuery
  encodeRelationshipQuery: (query?: RelationshipQuery | null) => RelationshipQueryWire
  decodeRelationshipQuery: (wire?: RelationshipQueryWire | RelationshipQuery | null) => RelationshipQuery
}
