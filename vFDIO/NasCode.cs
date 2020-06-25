using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading.Tasks;

namespace vFDIO
{
    class NasCode
    {
        public int internalPrimaryStart;
        public int internalPrimaryEnd;
        public int internalPrimary2Start;
        public int internalPrimary2End;
        public int internalPrimary3Start;
        public int internalPrimary3End;
        public int internalPrimary4Start;
        public int internalPrimary4End;
        public int internalSecondaryStart;
        public int internalSecondaryEnd;
        public int internalSecondary2Start;
        public int internalSecondary2End;
        public int internalSecondary3Start;
        public int internalSecondary3End;
        public int internalSecondary4Start;
        public int internalSecondary4End;
        public int internalSecondary5Start;
        public int internalSecondary5End;
        public int internalSecondary6Start;
        public int internalSecondary6End;
        public int internalSecondary7Start;
        public int internalSecondary7End;
        public int internalSecondary8Start;
        public int internalSecondary8End;
        public int internalSecondary9Start;
        public int internalSecondary9End;
        public int internalSecondary10Start;
        public int internalSecondary10End;
        public int externalPrimaryStart;
        public int externalPrimaryEnd;
        public int externalPrimary2Start;
        public int externalPrimary2End;
        public int externalPrimary3Start;
        public int externalPrimary3End;
        public int externalPrimary4Start;
        public int externalPrimary4End;
        public int externalPrimary5Start;
        public int externalPrimary5End;
        public int externalPrimary6Start;
        public int externalPrimary6End;
        public int externalPrimary7Start;
        public int externalPrimary7End;
        public int externalPrimary8Start;
        public int externalPrimary8End;
        public int externalPrimary9Start;
        public int externalPrimary9End;
        public int externalSecondaryStart;
        public int externalSecondaryEnd;
        public int externalSecondary2Start;
        public int externalSecondary2End;
        public int externalSecondary3Start;
        public int externalSecondary3End;
        public int externalSecondary4Start;
        public int externalSecondary4End;
        public int externalSecondary5Start;
        public int externalSecondary5End;
        public int externalSecondary6Start;
        public int externalSecondary6End;
        public int externalSecondary7Start;
        public int externalSecondary7End;
        public int externalSecondary8Start;
        public int externalSecondary8End;
        public int externalSecondary9Start;
        public int externalSecondary9End;
        public int externalTertiaryStart;
        public int externalTertiaryEnd;
        public int externalTertiary2Start;
        public int externalTertiary2End;
        public int externalTertiary3Start;
        public int externalTertiary3End;
        public int externalTertiary4Start;
        public int externalTertiary4End;
        public int externalTertiary5Start;
        public int externalTertiary5End;
        public int externalTertiary6Start;
        public int externalTertiary6End;
        public int externalTertiary7Start;
        public int externalTertiary7End;
        public int externalTertiary8Start;
        public int externalTertiary8End;
        public int externalTertiary9Start;
        public int externalTertiary9End;
        public int externalTertiary10Start;
        public int externalTertiary10End;
        public int externalTertiary11Start;
        public int externalTertiary11End;
        public int externalTertiary12Start;
        public int externalTertiary12End;


        public NasCode(int aInternalPrimaryStart, int aInternalPrimaryEnd, int aInternalSecondaryStart, int aInternalSecondaryEnd, int aExternalPrimaryStart, int aExternalPrimaryEnd, int aExternalSecondaryStart, int aExternalSecondaryEnd, int aExternalSecondary2Start, int aExternalSecondary2End, int aExternalTertiaryStart, int aExternalTertiaryEnd)
        {
            internalPrimaryStart = aInternalPrimaryStart;
            internalPrimaryEnd = aInternalPrimaryEnd;
            internalSecondaryStart = aInternalSecondaryStart;
            internalSecondaryEnd = aInternalSecondaryEnd;
            externalPrimaryStart = aExternalPrimaryStart;
            externalPrimaryEnd = aExternalPrimaryEnd;
            externalSecondaryStart = aExternalSecondaryStart;
            externalSecondaryEnd = aExternalSecondaryEnd;
            externalSecondary2Start = aExternalSecondary2Start;
            externalSecondary2End = aExternalSecondary2End;
            externalTertiaryStart = aExternalTertiaryStart;
            externalTertiaryEnd = aExternalTertiaryEnd;


            List<int> internalPrimaryRange = GenerateRange(internalPrimaryStart, internalPrimaryEnd);
            List<int> internalSecondaryRange = GenerateRange(internalSecondaryStart, internalSecondaryEnd);
            List<int> externalPrimaryRange = GenerateRange(externalPrimaryStart, externalPrimaryEnd);
            List<int> externalSecondaryRange = GenerateRange(externalSecondaryStart, externalSecondaryEnd);
            List<int> externalTertiaryRange = GenerateRange(externalTertiaryStart, externalTertiaryEnd);


        }

        public List<int> GenerateRange(int start, int end) 
        {
            return List.Range(start, (end - start)).Where(v => v.ToString().IndexOfAny(new char[] { '8', '9' }) == -1);
        }


    }


}
